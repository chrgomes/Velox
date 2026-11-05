import os

os.environ.setdefault("VELOX_DATABASE_URL", "postgresql+psycopg://velox:velox@localhost:5432/velox_test")
os.environ["VELOX_APP_MODE"] = "development"
os.environ["VELOX_PASSWORD_BREACH_CHECK"] = "false"

import re  # noqa: E402
import time  # noqa: E402
from collections.abc import Iterator  # noqa: E402

import pyotp  # noqa: E402
import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app.core.db import Base, SessionLocal, engine, utcnow  # noqa: E402
from app.core.security import encrypt, hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.modules.identity.models import Role, User  # noqa: E402
from app.modules.identity.rbac import seed_rbac  # noqa: E402
from app.modules.notifications.models import EmailMessage  # noqa: E402

PASSWORD = "Correct-Horse-42"


@pytest.fixture(scope="session", autouse=True)
def _migrated_database() -> Iterator[None]:
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    cfg = Config("alembic.ini")
    command.upgrade(cfg, "head")
    command.check(cfg)  # fails if models and migrations have drifted
    yield


@pytest.fixture(autouse=True)
def _clean_tables() -> Iterator[None]:
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed_rbac(db)
        db.commit()
    yield


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        c.headers["X-Requested-With"] = "XMLHttpRequest"
        yield c


def auth_header(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def register(client: TestClient, email: str = "alice@example.com", **extra: object) -> dict:
    payload = {
        "email": email,
        "password": PASSWORD,
        "first_name": "Alice",
        "last_name": "Martin",
        "country": "CA",
        "locale": "en",
        "accept_terms": True,
        **extra,
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def login(client: TestClient, email: str, password: str = PASSWORD) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def last_email(to: str, template: str | None = None) -> EmailMessage:
    with SessionLocal() as db:
        stmt = select(EmailMessage).where(EmailMessage.to_address == to)
        if template:
            stmt = stmt.where(EmailMessage.template == template)
        message = db.scalars(stmt.order_by(EmailMessage.created_at.desc())).first()
    assert message is not None, f"no {template or ''} email to {to}"
    return message


def token_from_email(to: str, template: str) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", last_email(to, template).body_text)
    assert match
    return match.group(1)


def totp_code(secret: str, offset_steps: int = 0) -> str:
    totp = pyotp.TOTP(secret)
    return totp.at(time.time() + offset_steps * 30)


def create_staff(email: str, role: str, *, mfa: bool = True) -> tuple[str, str | None]:
    """Create an active staff user directly; returns (email, totp secret)."""
    secret = pyotp.random_base32() if mfa else None
    with SessionLocal() as db:
        user = User(
            email=email,
            password_hash=hash_password(PASSWORD),
            first_name="Sam",
            last_name="Staff",
            country="CA",
            locale="en",
            is_staff=True,
            email_verified_at=utcnow(),
            mfa_enabled=mfa,
            mfa_secret_enc=encrypt(secret) if secret else None,
        )
        user.roles = [db.scalar(select(Role).where(Role.code == role))]
        db.add(user)
        db.commit()
    return email, secret


def staff_token(client: TestClient, email: str, secret: str | None) -> str:
    body = login(client, email)
    if secret is None:
        return body["access_token"]
    response = client.post("/api/v1/auth/login/mfa", json={"mfa_token": body["mfa_token"], "code": totp_code(secret)})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]
