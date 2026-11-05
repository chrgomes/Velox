import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import AppError, NotFound
from app.core.pagination import PageParams, paginate
from app.modules.accounts.models import Address
from app.modules.accounts.service import account_for_user
from app.modules.admin.models import SETTING_DEFAULTS, SystemSetting
from app.modules.audit import service as audit
from app.modules.audit.models import AuditLog
from app.modules.identity import service as identity
from app.modules.identity.models import RefreshToken, Role, User
from app.modules.notifications.models import EmailMessage

# ---------------------------------------------------------------------------------------- settings


def get_setting(db: Session, key: str) -> Any:
    row = db.get(SystemSetting, key)
    return row.value if row is not None else SETTING_DEFAULTS[key]


def all_settings(db: Session) -> dict[str, Any]:
    stored = {row.key: row.value for row in db.scalars(select(SystemSetting))}
    return {key: stored.get(key, default) for key, default in SETTING_DEFAULTS.items()}


def update_settings(db: Session, actor: User, values: dict[str, Any], request: Request) -> dict[str, Any]:
    for key, value in values.items():
        if key not in SETTING_DEFAULTS:
            raise AppError("settings.unknown_key", f"Unknown setting: {key}", 422)
        expected = type(SETTING_DEFAULTS[key])
        if not isinstance(value, expected) or (expected is int and isinstance(value, bool)):
            raise AppError("settings.invalid_value", f"Setting {key} must be {expected.__name__}.", 422)
        row = db.get(SystemSetting, key)
        old = row.value if row else SETTING_DEFAULTS[key]
        if row is None:
            db.add(SystemSetting(key=key, value=value, updated_by_user_id=actor.id))
        else:
            row.value, row.updated_by_user_id = value, actor.id
        audit.record(
            db,
            "settings.updated",
            actor=actor,
            entity_type="setting",
            entity_id=key,
            request=request,
            metadata={"old": old, "new": value},
        )
    db.commit()
    return all_settings(db)


# --------------------------------------------------------------------------------------- dashboard


def dashboard(db: Session) -> dict:
    now = utcnow()
    customers = select(User).where(User.is_staff.is_(False), User.status != "deleted")

    def count(stmt: Select) -> int:
        return db.scalar(select(func.count()).select_from(stmt.subquery())) or 0

    total = count(customers)
    verified = count(customers.where(User.email_verified_at.is_not(None)))
    recent = db.scalars(customers.order_by(User.created_at.desc()).limit(5)).all()
    return {
        "customers": {
            "total": total,
            "active": count(customers.where(User.status == "active")),
            "suspended": count(customers.where(User.status == "suspended")),
            "new_7d": count(customers.where(User.created_at >= now - timedelta(days=7))),
            "new_30d": count(customers.where(User.created_at >= now - timedelta(days=30))),
            "verified": verified,
        },
        "staff": count(select(User).where(User.is_staff.is_(True), User.status == "active")),
        "emails": {
            "queued": count(select(EmailMessage).where(EmailMessage.status == "queued")),
            "failed": count(select(EmailMessage).where(EmailMessage.status == "failed")),
        },
        "shipping_available": False,
        "recent_customers": [_customer_row(db, u) for u in recent],
    }


# --------------------------------------------------------------------------------------- customers


def _customer_row(db: Session, user: User) -> dict:
    account = account_for_user(db, user)
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "country": user.country,
        "locale": user.locale,
        "status": user.status,
        "email_verified": user.email_verified_at is not None,
        "mfa_enabled": user.mfa_enabled,
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
        "account_id": account.id if account else None,
        "account_status": account.status if account else None,
    }


def list_customers(db: Session, q: str | None, status: str | None, params: PageParams) -> tuple[list[dict], int]:
    stmt = select(User).where(User.is_staff.is_(False))
    if status:
        stmt = stmt.where(User.status == status)
    else:
        stmt = stmt.where(User.status != "deleted")
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.first_name.ilike(like), User.last_name.ilike(like)))
    rows, total = paginate(db, stmt.order_by(User.created_at.desc()), params)
    return [_customer_row(db, u) for u in rows], total


def _get_customer(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None or user.is_staff:
        raise NotFound("customer.not_found", "Customer not found.")
    return user


def customer_detail(db: Session, user_id: uuid.UUID, viewer: User) -> dict:
    user = _get_customer(db, user_id)
    row = _customer_row(db, user)
    account_id = row["account_id"]
    row["phone"] = user.phone
    row["address_count"] = (
        db.scalar(
            select(func.count())
            .select_from(Address)
            .where(Address.account_id == account_id, Address.deleted_at.is_(None))
        )
        if account_id
        else 0
    )
    row["active_sessions"] = db.scalar(
        select(func.count(func.distinct(RefreshToken.family_id))).where(
            RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > utcnow()
        )
    )
    row["locked"] = bool(user.locked_until and user.locked_until > utcnow())
    if "audit.view" in viewer.permission_codes:
        logs = db.scalars(
            select(AuditLog)
            .where(
                or_(
                    AuditLog.actor_user_id == user.id,
                    (AuditLog.entity_type == "user") & (AuditLog.entity_id == str(user.id)),
                )
            )
            .order_by(AuditLog.created_at.desc())
            .limit(20)
        ).all()
        row["recent_activity"] = [_audit_row(log, {}) for log in logs]
    else:
        row["recent_activity"] = None
    return row


def set_customer_status(
    db: Session, actor: User, user_id: uuid.UUID, suspend: bool, reason: str, request: Request
) -> dict:
    user = _get_customer(db, user_id)
    if user.status == "deleted":
        raise AppError("customer.closed", "This account is closed.", 409)
    account = account_for_user(db, user)
    user.status = "suspended" if suspend else "active"
    if account is not None:
        account.status = "suspended" if suspend else "active"
    if suspend:
        identity.revoke_all_sessions(db, user)
    else:
        user.locked_until, user.failed_login_count = None, 0
    audit.record(
        db, "customer.suspended" if suspend else "customer.reactivated", actor=actor, entity_type="user",
        entity_id=user.id, request=request, metadata={"reason": reason},
    )  # fmt: skip
    db.commit()
    return _customer_row(db, user)


# ------------------------------------------------------------------------------------------- staff


def _staff_row(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "status": user.status,
        "roles": user.role_codes,
        "mfa_enabled": user.mfa_enabled,
        "invitation_pending": user.email_verified_at is None,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
    }


def list_staff(db: Session) -> list[dict]:
    return [_staff_row(u) for u in db.scalars(select(User).where(User.is_staff.is_(True)).order_by(User.created_at))]


def _roles(db: Session, codes: list[str]) -> list[Role]:
    roles = list(db.scalars(select(Role).where(Role.code.in_(codes))))
    if not codes or len(roles) != len(set(codes)):
        raise AppError("staff.invalid_roles", "Choose at least one valid role.", 422)
    return roles


def _active_super_admins(db: Session) -> int:
    return (
        db.scalar(
            select(func.count())
            .select_from(User)
            .join(User.roles)
            .where(Role.code == "super_admin", User.status == "active", User.is_staff.is_(True))
        )
        or 0
    )


def create_staff(db: Session, actor: User, data: dict, request: Request) -> dict:
    email = identity.normalize_email(data["email"])
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AppError("staff.email_in_use", "A user with this email already exists.", 409)
    user = User(
        email=email,
        password_hash=identity.unusable_password_hash(),
        first_name=data["first_name"],
        last_name=data["last_name"],
        country=data.get("country", "CA"),
        locale=data.get("locale", "en"),
        is_staff=True,
    )
    user.roles = _roles(db, data["roles"])
    db.add(user)
    db.flush()
    identity.invite_staff(db, user)
    audit.record(
        db,
        "staff.created",
        actor=actor,
        entity_type="user",
        entity_id=user.id,
        request=request,
        metadata={"roles": data["roles"]},
    )
    db.commit()
    return _staff_row(user)


def update_staff(db: Session, actor: User, user_id: uuid.UUID, data: dict, request: Request) -> dict:
    user = db.get(User, user_id)
    if user is None or not user.is_staff:
        raise NotFound("staff.not_found", "Staff member not found.")
    was_super = "super_admin" in user.role_codes and user.status == "active"
    changes: dict[str, Any] = {}
    if data.get("roles") is not None:
        user.roles = _roles(db, data["roles"])
        changes["roles"] = data["roles"]
    if data.get("status") is not None:
        if user.id == actor.id and data["status"] != "active":
            raise AppError("staff.cannot_suspend_self", "You cannot suspend your own account.", 409)
        user.status = data["status"]
        changes["status"] = data["status"]
        if data["status"] != "active":
            identity.revoke_all_sessions(db, user)
    db.flush()
    is_super = "super_admin" in user.role_codes and user.status == "active"
    if was_super and not is_super and _active_super_admins(db) == 0:
        db.rollback()
        raise AppError("staff.last_super_admin", "At least one active super administrator is required.", 409)
    audit.record(
        db, "staff.updated", actor=actor, entity_type="user", entity_id=user.id, request=request, metadata=changes
    )
    db.commit()
    return _staff_row(user)


def resend_invite(db: Session, actor: User, user_id: uuid.UUID, request: Request) -> None:
    user = db.get(User, user_id)
    if user is None or not user.is_staff:
        raise NotFound("staff.not_found", "Staff member not found.")
    if user.email_verified_at is not None:
        raise AppError("staff.already_active", "This staff member has already set a password.", 409)
    identity._invalidate_tokens(db, user, "reset_password")
    identity.invite_staff(db, user)
    audit.record(db, "staff.invite_resent", actor=actor, entity_type="user", entity_id=user.id, request=request)
    db.commit()


def list_roles(db: Session) -> list[dict]:
    return [
        {"code": r.code, "name": r.name, "permissions": sorted(p.code for p in r.permissions)}
        for r in db.scalars(select(Role).order_by(Role.code))
    ]


# ------------------------------------------------------------------------------------------- audit


def _audit_row(log: AuditLog, emails: dict[uuid.UUID, str]) -> dict:
    return {
        "id": log.id,
        "created_at": log.created_at,
        "action": log.action,
        "actor_type": log.actor_type,
        "actor_user_id": log.actor_user_id,
        "actor_email": emails.get(log.actor_user_id) if log.actor_user_id else None,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "ip": str(log.ip) if log.ip else None,
        "metadata": log.metadata_,
    }


def list_audit(
    db: Session,
    params: PageParams,
    action: str | None,
    actor_user_id: uuid.UUID | None,
    entity_type: str | None,
    entity_id: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
) -> tuple[list[dict], int]:
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.startswith(action, autoescape=True))
    if actor_user_id:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= date_from)
    if date_to:
        stmt = stmt.where(AuditLog.created_at < date_to)
    rows, total = paginate(db, stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()), params)
    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id}
    emails = dict(db.execute(select(User.id, User.email).where(User.id.in_(actor_ids))).all()) if actor_ids else {}
    return [_audit_row(r, emails) for r in rows], total
