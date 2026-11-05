"""Password hashing, tokens and field encryption."""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from cryptography.fernet import Fernet

from app.core.config import get_settings

_hasher = PasswordHasher()  # Argon2id with library defaults (RFC 9106 low-memory profile)

# Used to equalise timing when the account does not exist.
_DUMMY_HASH = _hasher.hash("dummy-password-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(user_id: uuid.UUID, session_id: uuid.UUID, roles: list[str]) -> tuple[str, int]:
    settings = get_settings()
    now = datetime.now(UTC)
    expires_in = settings.access_token_minutes * 60
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "roles": roles,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=expires_in)).timestamp()),
        "jti": uuid.uuid4().hex,
        "typ": "access",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm), expires_in


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[settings.jwt_algorithm],
        options={"require": ["sub", "sid", "exp", "iat", "typ"]},
    )
    if payload.get("typ") != "access":
        raise jwt.InvalidTokenError("wrong token type")
    return payload


def new_opaque_token() -> str:
    """256-bit random token for refresh / email / MFA-login tokens."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def _fernet() -> Fernet:
    return Fernet(get_settings().encryption_key.encode())


def encrypt(value: str) -> bytes:
    return _fernet().encrypt(value.encode())


def decrypt(value: bytes) -> str:
    return _fernet().decrypt(value).decode()
