"""Shared FastAPI dependencies: current user, current account, permission checks."""

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db, utcnow
from app.core.errors import AppError, Forbidden, Unauthorized
from app.core.security import decode_access_token
from app.modules.accounts.models import Account, AccountMember
from app.modules.identity.models import RefreshToken, User

DB = Annotated[Session, Depends(get_db)]

_bearer = HTTPBearer(auto_error=False)


@dataclass
class AuthContext:
    user: User
    session_id: uuid.UUID


def get_auth(
    db: DB,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthContext:
    if credentials is None:
        raise Unauthorized()
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except (jwt.PyJWTError, ValueError, KeyError):
        raise Unauthorized("auth.invalid_token", "Invalid or expired access token.") from None

    user = db.get(User, user_id)
    if user is None or user.status != "active":
        raise Unauthorized("auth.invalid_token", "Invalid or expired access token.")
    # Sessions revoked via logout / logout-all / password reset stop working immediately.
    session_alive = db.scalar(
        select(
            exists().where(
                RefreshToken.family_id == session_id,
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.absolute_expires_at > utcnow(),
            )
        )
    )
    if not session_alive:
        raise Unauthorized("auth.session_revoked", "This session has ended. Please log in again.")
    return AuthContext(user=user, session_id=session_id)


Auth = Annotated[AuthContext, Depends(get_auth)]


def get_current_user(auth: Auth) -> User:
    return auth.user


CurrentUser = Annotated[User, Depends(get_current_user)]


def get_current_account(db: DB, user: CurrentUser) -> Account:
    """The account the request acts on. MVP: a customer's single personal account."""
    account = db.scalar(
        select(Account)
        .join(AccountMember, AccountMember.account_id == Account.id)
        .where(AccountMember.user_id == user.id)
        .order_by(AccountMember.created_at)
        .limit(1)
    )
    if account is None:
        raise Forbidden("account.none", "This user has no customer account.")
    if account.status != "active":
        raise Forbidden("account.inactive", "This account is not active.")
    return account


CurrentAccount = Annotated[Account, Depends(get_current_account)]


def require_permission(code: str) -> Callable[[User], User]:
    """Dependency factory for staff endpoints. Staff must have MFA enabled when required by settings."""

    def checker(user: CurrentUser) -> User:
        if not user.is_staff or code not in user.permission_codes:
            raise Forbidden()
        if get_settings().require_staff_mfa and not user.mfa_enabled:
            raise AppError(
                "auth.staff_mfa_required",
                "Staff accounts must enable two-factor authentication before using the admin area.",
                403,
            )
        return user

    return checker


def request_meta(request: Request) -> tuple[str | None, str | None]:
    from app.core.rate_limit import client_ip

    return client_ip(request), (request.headers.get("User-Agent") or "")[:512] or None
