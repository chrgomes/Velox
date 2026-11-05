"""Seed reference data (roles and permissions). Idempotent; run after every migration.

python -m scripts.seed            # roles + permissions
python -m scripts.seed --demo     # also create demo users (development only)
"""

import argparse
import sys

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal, utcnow
from app.core.security import hash_password
from app.modules.accounts.models import Account, AccountMember, Address
from app.modules.identity.models import Role, User
from app.modules.identity.rbac import seed_rbac

DEMO_PASSWORD = "Velox-demo-2026!"


def _demo(db) -> None:  # type: ignore[no-untyped-def]
    roles = {r.code: r for r in db.scalars(select(Role))}
    if db.scalar(select(User).where(User.email == "admin@example.com")) is None:
        # Staff MFA is required; the admin is prompted to set it up on first login.
        admin = User(
            email="admin@example.com", password_hash=hash_password(DEMO_PASSWORD), first_name="Avery",
            last_name="Admin", country="CA", locale="en", is_staff=True, email_verified_at=utcnow(),
        )  # fmt: skip
        admin.roles = [roles["super_admin"]]
        db.add(admin)
    if db.scalar(select(User).where(User.email == "demo@example.com")) is None:
        user = User(
            email="demo@example.com", password_hash=hash_password(DEMO_PASSWORD), first_name="Dana",
            last_name="Demo", country="CA", locale="en", email_verified_at=utcnow(),
        )  # fmt: skip
        db.add(user)
        db.flush()
        account = Account(type="individual", name="Dana Demo", country="CA", default_currency="CAD")
        db.add(account)
        db.flush()
        db.add(AccountMember(account_id=account.id, user_id=user.id, role="owner"))
        db.add(
            Address(
                account_id=account.id, nickname="Home", name="Dana Demo", street1="100 Queen St W",
                city="Toronto", region="ON", postal_code="M5H 2N2", country="CA", is_default_sender=True,
                verified_at=utcnow(),
            )
        )  # fmt: skip
    print(f"Demo users: admin@example.com / demo@example.com (password: {DEMO_PASSWORD})")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--demo", action="store_true", help="create demo users (development only)")
    args = parser.parse_args()
    with SessionLocal() as db:
        seed_rbac(db)
        if args.demo:
            if get_settings().app_mode == "production":
                sys.exit("Refusing to create demo users in production.")
            _demo(db)
        db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    main()
