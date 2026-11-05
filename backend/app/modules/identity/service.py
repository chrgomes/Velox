"""Authentication, sessions, MFA and password management."""

import hashlib
import logging
import secrets
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta

import httpx
import pyotp
import qrcode
import qrcode.image.svg
from fastapi import Request
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.deps import request_meta
from app.core.errors import AppError, Forbidden, Unauthorized
from app.core.rate_limit import client_ip, hit
from app.core.security import (
    create_access_token,
    decrypt,
    encrypt,
    hash_password,
    hash_token,
    new_opaque_token,
    password_needs_rehash,
    verify_password,
)
from app.modules.accounts.models import Account, AccountMember
from app.modules.audit import service as audit
from app.modules.identity.models import MfaRecoveryCode, OneTimeToken, RefreshToken, User
from app.modules.identity.schemas import MeOut, RegisterIn
from app.modules.notifications import service as notifications
from app.modules.reference.data import COUNTRIES

log = logging.getLogger("velox.identity")

RECOVERY_CODE_COUNT = 10
_RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
_COMMON_PASSWORDS = {
    "password123", "password1234", "1234567890", "qwertyuiop", "iloveyou12", "letmein123",
    "welcome123", "abc1234567", "passw0rd123", "0987654321", "1q2w3e4r5t", "qwerty1234",
}  # fmt: skip


# ---------------------------------------------------------------------------------------- helpers


def normalize_email(email: str) -> str:
    return email.strip().lower()


def me_out(user: User) -> MeOut:
    settings = get_settings()
    return MeOut(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        phone=user.phone,
        locale=user.locale,
        country=user.country,
        timezone=user.timezone,
        email_verified=user.email_verified_at is not None,
        mfa_enabled=user.mfa_enabled,
        is_staff=user.is_staff,
        roles=user.role_codes,
        permissions=sorted(user.permission_codes) if user.is_staff else [],
        mfa_setup_required=user.is_staff and settings.require_staff_mfa and not user.mfa_enabled,
    )


def validate_password(password: str, email: str) -> None:
    lowered = password.lower()
    if len(set(password)) < 4 or lowered in _COMMON_PASSWORDS or lowered == email.lower():
        raise AppError("auth.password_weak", "Choose a less common password.", 422)
    if get_settings().password_breach_check and _password_breached(password):
        raise AppError(
            "auth.password_breached",
            "This password has appeared in a data breach. Choose a different one.",
            422,
        )


def _password_breached(password: str) -> bool:
    digest = hashlib.sha1(password.encode()).hexdigest().upper()  # noqa: S324 - required by the HIBP API
    prefix, suffix = digest[:5], digest[5:]
    try:
        response = httpx.get(
            f"https://api.pwnedpasswords.com/range/{prefix}", timeout=3, headers={"Add-Padding": "true"}
        )
        response.raise_for_status()
    except httpx.HTTPError:
        log.warning("breached-password check unavailable; allowing password")
        return False
    for line in response.text.splitlines():
        candidate, _, count = line.partition(":")
        if candidate == suffix and count.strip() != "0":
            return True
    return False


def _create_one_time_token(db: Session, user: User, purpose: str, lifetime: timedelta) -> str:
    raw = new_opaque_token()
    db.add(OneTimeToken(user_id=user.id, purpose=purpose, token_hash=hash_token(raw), expires_at=utcnow() + lifetime))
    return raw


def _consume_one_time_token(db: Session, raw: str, purpose: str) -> User:
    row = db.scalar(
        select(OneTimeToken)
        .where(OneTimeToken.token_hash == hash_token(raw), OneTimeToken.purpose == purpose)
        .with_for_update()
    )
    if row is None or row.used_at is not None or row.expires_at < utcnow():
        raise AppError("auth.token_invalid", "This link is invalid or has expired.", 400)
    row.used_at = utcnow()
    user = db.get(User, row.user_id)
    if user is None or user.status == "deleted":
        raise AppError("auth.token_invalid", "This link is invalid or has expired.", 400)
    return user


def _invalidate_tokens(db: Session, user: User, purpose: str) -> None:
    db.execute(
        update(OneTimeToken)
        .where(OneTimeToken.user_id == user.id, OneTimeToken.purpose == purpose, OneTimeToken.used_at.is_(None))
        .values(used_at=utcnow())
    )


# ------------------------------------------------------------------------------------- sessions


@dataclass
class IssuedSession:
    access_token: str
    expires_in: int
    refresh_token: str
    session_id: uuid.UUID


def issue_session(db: Session, user: User, request: Request) -> IssuedSession:
    settings = get_settings()
    now = utcnow()
    ip, ua = request_meta(request)
    raw = new_opaque_token()
    family_id = uuid.uuid4()
    db.add(
        RefreshToken(
            user_id=user.id,
            family_id=family_id,
            token_hash=hash_token(raw),
            expires_at=now + timedelta(days=settings.refresh_token_days),
            absolute_expires_at=now + timedelta(days=settings.refresh_token_absolute_days),
            ip=_safe_ip(ip),
            user_agent=ua,
        )
    )
    user.last_login_at = now
    access, expires_in = create_access_token(user.id, family_id, user.role_codes)
    return IssuedSession(access, expires_in, raw, family_id)


def _safe_ip(ip: str | None) -> str | None:
    import ipaddress

    try:
        return str(ipaddress.ip_address(ip)) if ip else None
    except ValueError:
        return None


def revoke_family(db: Session, family_id: uuid.UUID) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


def revoke_all_sessions(db: Session, user: User, except_family: uuid.UUID | None = None) -> None:
    stmt = update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
    if except_family is not None:
        stmt = stmt.where(RefreshToken.family_id != except_family)
    db.execute(stmt.values(revoked_at=utcnow()))


def rotate_refresh_token(db: Session, raw: str | None, request: Request) -> tuple[IssuedSession, User]:
    if not raw:
        raise Unauthorized("auth.no_session", "No active session.")
    settings = get_settings()
    now = utcnow()
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)).with_for_update())
    if row is None:
        raise Unauthorized("auth.no_session", "No active session.")
    if row.revoked_at is not None or row.used_at is not None:
        # A rotated (already used) token was presented again: assume theft and end the whole session.
        revoke_family(db, row.family_id)
        user = db.get(User, row.user_id)
        audit.record(
            db,
            "auth.refresh_reuse_detected",
            actor=user,
            entity_type="session",
            entity_id=row.family_id,
            request=request,
        )
        db.commit()
        raise Unauthorized("auth.session_revoked", "This session has ended. Please log in again.")
    if row.expires_at < now or row.absolute_expires_at < now:
        raise Unauthorized("auth.session_expired", "Your session has expired. Please log in again.")
    user = db.get(User, row.user_id)
    if user is None or user.status != "active":
        revoke_family(db, row.family_id)
        db.commit()
        raise Unauthorized("auth.no_session", "No active session.")

    ip, ua = request_meta(request)
    new_raw = new_opaque_token()
    new_row = RefreshToken(
        id=uuid.uuid4(),
        user_id=user.id,
        family_id=row.family_id,
        token_hash=hash_token(new_raw),
        expires_at=min(now + timedelta(days=settings.refresh_token_days), row.absolute_expires_at),
        absolute_expires_at=row.absolute_expires_at,
        ip=_safe_ip(ip),
        user_agent=ua,
    )
    db.add(new_row)
    db.flush()
    row.used_at = now
    row.replaced_by_id = new_row.id
    access, expires_in = create_access_token(user.id, row.family_id, user.role_codes)
    db.commit()
    return IssuedSession(access, expires_in, new_raw, row.family_id), user


def end_session(db: Session, raw: str | None) -> None:
    if not raw:
        return
    row = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if row is not None:
        revoke_family(db, row.family_id)
        db.commit()


def list_sessions(db: Session, user: User, current: uuid.UUID) -> list[dict]:
    now = utcnow()
    started = (
        select(RefreshToken.family_id, func.min(RefreshToken.created_at).label("started_at"))
        .where(RefreshToken.user_id == user.id)
        .group_by(RefreshToken.family_id)
        .subquery()
    )
    rows = db.execute(
        select(RefreshToken, started.c.started_at)
        .join(started, started.c.family_id == RefreshToken.family_id)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.used_at.is_(None),
            RefreshToken.expires_at > now,
        )
        .order_by(RefreshToken.created_at.desc())
    ).all()
    return [
        {
            "id": tip.family_id,
            "started_at": started_at,
            "last_used_at": tip.created_at,
            "expires_at": tip.expires_at,
            "ip": str(tip.ip) if tip.ip else None,
            "user_agent": tip.user_agent,
            "current": tip.family_id == current,
        }
        for tip, started_at in rows
    ]


# ---------------------------------------------------------------------------------- registration


def register(db: Session, data: RegisterIn, request: Request) -> User:
    from app.modules.admin.service import get_setting

    hit("register_ip", client_ip(request))
    if not get_setting(db, "registration_open"):
        raise AppError("auth.registration_closed", "Registration is temporarily closed.", 403)
    email = normalize_email(data.email)
    validate_password(data.password, email)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        # Do not reveal whether the address is registered: tell the owner by email instead in a
        # later phase. For now the API returns a generic conflict code the UI words neutrally.
        raise AppError("auth.registration_failed", "We could not create an account with these details.", 409)

    user = User(
        email=email,
        password_hash=hash_password(data.password),
        first_name=data.first_name,
        last_name=data.last_name,
        country=data.country,
        locale=data.locale,
        timezone="America/Toronto" if data.country == "CA" else "America/New_York",
    )
    db.add(user)
    db.flush()
    account = Account(
        type="individual",
        name=user.full_name,
        country=data.country,
        default_currency=COUNTRIES[data.country]["currency"],
    )
    db.add(account)
    db.flush()
    db.add(AccountMember(account_id=account.id, user_id=user.id, role="owner"))
    send_verification_email(db, user)
    audit.record(db, "auth.register", actor=user, entity_type="user", entity_id=user.id, request=request)
    return user


def send_verification_email(db: Session, user: User) -> None:
    _invalidate_tokens(db, user, "verify_email")
    raw = _create_one_time_token(db, user, "verify_email", timedelta(hours=get_settings().verify_email_token_hours))
    notifications.queue_email(
        db,
        "verify_email",
        to=user.email,
        locale=user.locale,
        name=user.first_name,
        user_id=user.id,
        action_url=notifications.web_url(f"/verify-email?token={raw}"),
    )


def resend_verification(db: Session, email: str, request: Request) -> None:
    email = normalize_email(email)
    hit("email_send", f"{client_ip(request)}|{email}")
    user = db.scalar(select(User).where(User.email == email))
    if user and user.status == "active" and user.email_verified_at is None:
        send_verification_email(db, user)
        db.commit()


def verify_email(db: Session, raw: str, request: Request) -> User:
    user = _consume_one_time_token(db, raw, "verify_email")
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
        audit.record(db, "auth.email_verified", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()
    return user


# ----------------------------------------------------------------------------------------- login


def _register_failure(db: Session, user: User | None, request: Request, reason: str) -> None:
    settings = get_settings()
    if user is not None:
        user.failed_login_count += 1
        if user.failed_login_count >= settings.login_max_failures:
            user.locked_until = utcnow() + timedelta(minutes=settings.login_lockout_minutes)
            user.failed_login_count = 0
            audit.record(db, "auth.account_locked", actor=user, entity_type="user", entity_id=user.id, request=request)
        audit.record(
            db,
            "auth.login_failed",
            actor=user,
            entity_type="user",
            entity_id=user.id,
            request=request,
            metadata={"reason": reason},
        )
    db.commit()


def _check_lock(user: User | None) -> None:
    if user is not None and user.locked_until is not None and user.locked_until > utcnow():
        retry = int((user.locked_until - utcnow()).total_seconds()) + 1
        raise AppError(
            "auth.account_locked",
            "Too many failed attempts. Try again later or reset your password.",
            429,
            details={"retry_after": retry},
            headers={"Retry-After": str(retry)},
        )


def authenticate(db: Session, email: str, password: str, request: Request) -> User:
    email = normalize_email(email)
    hit("login_ip", client_ip(request))
    hit("login_email", email)
    user = db.scalar(select(User).where(User.email == email).with_for_update())
    _check_lock(user)
    valid = verify_password(user.password_hash if user else None, password)
    if user is None or not valid or user.status == "deleted":
        _register_failure(db, user if user and user.status != "deleted" else None, request, "bad_credentials")
        raise Unauthorized("auth.invalid_credentials", "Email or password is incorrect.")
    if user.status == "suspended":
        db.commit()
        raise Forbidden("auth.account_suspended", "This account is suspended. Contact support.")
    user.failed_login_count = 0
    user.locked_until = None
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
    return user


def start_mfa_challenge(db: Session, user: User) -> str:
    _invalidate_tokens(db, user, "mfa_login")
    return _create_one_time_token(db, user, "mfa_login", timedelta(minutes=get_settings().mfa_login_token_minutes))


def complete_mfa_challenge(db: Session, mfa_token: str, code: str, request: Request) -> User:
    hit("login_ip", client_ip(request))
    row = db.scalar(
        select(OneTimeToken)
        .where(OneTimeToken.token_hash == hash_token(mfa_token), OneTimeToken.purpose == "mfa_login")
        .with_for_update()
    )
    if row is None or row.used_at is not None or row.expires_at < utcnow():
        raise Unauthorized("auth.mfa_token_invalid", "Your sign-in attempt expired. Please log in again.")
    user = db.get(User, row.user_id, with_for_update=True)
    if user is None or user.status != "active" or not user.mfa_enabled:
        raise Unauthorized("auth.mfa_token_invalid", "Your sign-in attempt expired. Please log in again.")
    _check_lock(user)
    if not (verify_totp(user, code) or use_recovery_code(db, user, code)):
        _register_failure(db, user, request, "bad_mfa_code")
        raise Unauthorized("auth.mfa_code_invalid", "That code is not valid.")
    row.used_at = utcnow()
    user.failed_login_count = 0
    return user


# ------------------------------------------------------------------------------------------- MFA


def _totp(secret: str) -> pyotp.TOTP:
    return pyotp.TOTP(secret)


def _match_totp(secret: str, code: str, last_counter: int | None) -> int | None:
    code = code.strip().replace(" ", "")
    if not (code.isdigit() and len(code) == 6):
        return None
    totp = _totp(secret)
    now = time.time()
    for offset in (0, -1, 1):
        counter = int(now) // totp.interval + offset
        if secrets.compare_digest(totp.generate_otp(counter), code):
            if last_counter is not None and counter <= last_counter:
                return None
            return counter
    return None


def verify_totp(user: User, code: str) -> bool:
    if not user.mfa_secret_enc:
        return False
    counter = _match_totp(decrypt(user.mfa_secret_enc), code, user.mfa_last_counter)
    if counter is None:
        return False
    user.mfa_last_counter = counter
    return True


def _hash_recovery(code: str) -> bytes:
    return hashlib.sha256(code.strip().lower().replace("-", "").replace(" ", "").encode()).digest()


def use_recovery_code(db: Session, user: User, code: str) -> bool:
    row = db.scalar(
        select(MfaRecoveryCode).where(
            MfaRecoveryCode.user_id == user.id,
            MfaRecoveryCode.code_hash == _hash_recovery(code),
            MfaRecoveryCode.used_at.is_(None),
        )
    )
    if row is None:
        return False
    row.used_at = utcnow()
    return True


def mfa_setup(db: Session, user: User) -> dict:
    if user.mfa_enabled:
        raise AppError("auth.mfa_already_enabled", "Two-factor authentication is already on.", 409)
    secret = pyotp.random_base32()
    user.mfa_pending_secret_enc = encrypt(secret)
    db.commit()
    uri = _totp(secret).provisioning_uri(name=user.email, issuer_name=get_settings().app_name)
    svg = qrcode.make(uri, image_factory=qrcode.image.svg.SvgPathImage, box_size=8, border=2).to_string(
        encoding="unicode"
    )
    return {"secret": secret, "otpauth_uri": uri, "qr_svg": svg}


def _new_recovery_codes(db: Session, user: User) -> list[str]:
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    codes = []
    for _ in range(RECOVERY_CODE_COUNT):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(10))
        code = f"{raw[:5]}-{raw[5:]}"
        codes.append(code)
        db.add(MfaRecoveryCode(user_id=user.id, code_hash=_hash_recovery(code)))
    return codes


def mfa_enable(db: Session, user: User, code: str, request: Request) -> list[str]:
    if user.mfa_enabled:
        raise AppError("auth.mfa_already_enabled", "Two-factor authentication is already on.", 409)
    if not user.mfa_pending_secret_enc:
        raise AppError("auth.mfa_setup_required", "Start two-factor setup first.", 409)
    secret = decrypt(user.mfa_pending_secret_enc)
    counter = _match_totp(secret, code, None)
    if counter is None:
        raise AppError("auth.mfa_code_invalid", "That code is not valid.", 400)
    user.mfa_secret_enc = user.mfa_pending_secret_enc
    user.mfa_pending_secret_enc = None
    user.mfa_enabled = True
    user.mfa_last_counter = counter
    codes = _new_recovery_codes(db, user)
    notifications.queue_email(
        db, "mfa_enabled", to=user.email, locale=user.locale, name=user.first_name, user_id=user.id
    )
    audit.record(db, "auth.mfa_enabled", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()
    return codes


def mfa_disable(db: Session, user: User, password: str, code: str, request: Request) -> None:
    if not user.mfa_enabled:
        raise AppError("auth.mfa_not_enabled", "Two-factor authentication is not on.", 409)
    if user.is_staff and get_settings().require_staff_mfa:
        raise Forbidden("auth.staff_mfa_required", "Staff accounts cannot turn off two-factor authentication.")
    if not verify_password(user.password_hash, password):
        raise AppError("auth.password_incorrect", "Your password is incorrect.", 400)
    if not (verify_totp(user, code) or use_recovery_code(db, user, code)):
        raise AppError("auth.mfa_code_invalid", "That code is not valid.", 400)
    user.mfa_enabled = False
    user.mfa_secret_enc = None
    user.mfa_last_counter = None
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == user.id))
    notifications.queue_email(
        db, "mfa_disabled", to=user.email, locale=user.locale, name=user.first_name, user_id=user.id
    )
    audit.record(db, "auth.mfa_disabled", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()


def regenerate_recovery_codes(db: Session, user: User, code: str, request: Request) -> list[str]:
    if not user.mfa_enabled:
        raise AppError("auth.mfa_not_enabled", "Two-factor authentication is not on.", 409)
    if not verify_totp(user, code):
        raise AppError("auth.mfa_code_invalid", "That code is not valid.", 400)
    codes = _new_recovery_codes(db, user)
    audit.record(
        db, "auth.mfa_recovery_regenerated", actor=user, entity_type="user", entity_id=user.id, request=request
    )
    db.commit()
    return codes


# -------------------------------------------------------------------------------------- passwords


def forgot_password(db: Session, email: str, request: Request) -> None:
    email = normalize_email(email)
    hit("email_send", f"{client_ip(request)}|{email}")
    user = db.scalar(select(User).where(User.email == email))
    if user is None or user.status == "deleted":
        return
    _invalidate_tokens(db, user, "reset_password")
    raw = _create_one_time_token(db, user, "reset_password", timedelta(hours=get_settings().reset_password_token_hours))
    notifications.queue_email(
        db,
        "reset_password",
        to=user.email,
        locale=user.locale,
        name=user.first_name,
        user_id=user.id,
        action_url=notifications.web_url(f"/reset-password?token={raw}"),
    )
    audit.record(
        db, "auth.password_reset_requested", actor=user, entity_type="user", entity_id=user.id, request=request
    )
    db.commit()


def reset_password(db: Session, raw: str, new_password: str, request: Request) -> None:
    user = _consume_one_time_token(db, raw, "reset_password")
    validate_password(new_password, user.email)
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    # The link proves control of the mailbox, so it also verifies the address (e.g. staff invites).
    if user.email_verified_at is None:
        user.email_verified_at = utcnow()
    revoke_all_sessions(db, user)
    _invalidate_tokens(db, user, "reset_password")
    notifications.queue_email(
        db, "password_changed", to=user.email, locale=user.locale, name=user.first_name, user_id=user.id
    )
    audit.record(db, "auth.password_reset", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()


def change_password(db: Session, user: User, current: str, new: str, session_id: uuid.UUID, request: Request) -> None:
    if not verify_password(user.password_hash, current):
        audit.record(
            db, "auth.password_change_failed", actor=user, entity_type="user", entity_id=user.id, request=request
        )
        db.commit()
        raise AppError("auth.password_incorrect", "Your current password is incorrect.", 400)
    validate_password(new, user.email)
    user.password_hash = hash_password(new)
    revoke_all_sessions(db, user, except_family=session_id)
    notifications.queue_email(
        db, "password_changed", to=user.email, locale=user.locale, name=user.first_name, user_id=user.id
    )
    audit.record(db, "auth.password_changed", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()


def invite_staff(db: Session, user: User) -> None:
    raw = _create_one_time_token(db, user, "reset_password", timedelta(hours=get_settings().staff_invite_token_hours))
    notifications.queue_email(
        db,
        "staff_invite",
        to=user.email,
        locale=user.locale,
        name=user.first_name,
        user_id=user.id,
        action_url=notifications.web_url(f"/reset-password?token={raw}&invite=1"),
    )


def unusable_password_hash() -> str:
    return hash_password(new_opaque_token())
