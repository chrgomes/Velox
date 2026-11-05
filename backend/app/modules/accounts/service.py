import uuid

from fastapi import Request
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.db import utcnow
from app.core.errors import AppError, NotFound
from app.core.pagination import PageParams, paginate
from app.core.security import verify_password
from app.integrations.shipping_providers.base import AddressInput, get_shipping_provider
from app.modules.accounts.models import Account, AccountMember, Address
from app.modules.accounts.schemas import AddressIn, AddressOut, CustomerOut, ProfileUpdate
from app.modules.audit import service as audit
from app.modules.identity import service as identity
from app.modules.identity.models import MfaRecoveryCode, OneTimeToken, User
from app.modules.notifications import service as notifications


def account_for_user(db: Session, user: User) -> Account | None:
    return db.scalar(
        select(Account)
        .join(AccountMember, AccountMember.account_id == Account.id)
        .where(AccountMember.user_id == user.id)
        .order_by(AccountMember.created_at)
        .limit(1)
    )


def customer_out(db: Session, user: User) -> CustomerOut:
    account = account_for_user(db, user)
    return CustomerOut(**identity.me_out(user).model_dump(), account=account)


def update_profile(db: Session, user: User, data: ProfileUpdate, request: Request) -> CustomerOut:
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(user, field, value)
    if {"first_name", "last_name"} & changes.keys():
        account = account_for_user(db, user)
        if account is not None and account.type == "individual":
            account.name = user.full_name
    if changes:
        audit.record(
            db,
            "profile.updated",
            actor=user,
            entity_type="user",
            entity_id=user.id,
            request=request,
            metadata={"fields": sorted(changes)},
        )
    db.commit()
    return customer_out(db, user)


def dashboard(db: Session, user: User, account: Account) -> dict:
    address_count = db.scalar(
        select(func.count()).select_from(Address).where(Address.account_id == account.id, Address.deleted_at.is_(None))
    )
    has_sender = db.scalar(
        select(func.count())
        .select_from(Address)
        .where(Address.account_id == account.id, Address.deleted_at.is_(None), Address.is_default_sender)
    )
    return {
        # Shipping arrives in Phase 2; counts are real (zero) rather than placeholders.
        "shipping_available": False,
        "shipments": {"total": 0, "active": 0, "delivered": 0, "drafts": 0, "cancelled": 0},
        "spend_this_month": [],
        "recent_shipments": [],
        "recent_payments": [],
        "setup": {
            "email_verified": user.email_verified_at is not None,
            "has_addresses": bool(address_count),
            "has_default_sender": bool(has_sender),
            "mfa_enabled": user.mfa_enabled,
        },
        "address_count": address_count or 0,
        "currency": account.default_currency,
    }


def close_account(
    db: Session, user: User, account: Account | None, password: str, code: str | None, request: Request
) -> None:
    if not verify_password(user.password_hash, password):
        raise AppError("auth.password_incorrect", "Your password is incorrect.", 400)
    if user.mfa_enabled and not (
        code and (identity.verify_totp(user, code) or identity.use_recovery_code(db, user, code))
    ):
        raise AppError("auth.mfa_code_invalid", "That code is not valid.", 400)
    if user.is_staff:
        raise AppError("account.staff_cannot_close", "Staff accounts are closed by an administrator.", 403)

    notifications.mark_user_emails_failed(db, user.id)
    notifications.queue_email(db, "account_closed", to=user.email, locale=user.locale, name=user.first_name)
    identity.revoke_all_sessions(db, user)
    now = utcnow()
    original_id = user.id
    user.email = f"deleted-{original_id}@deleted.invalid"
    user.first_name, user.last_name, user.phone = "Deleted", "User", None
    user.password_hash = identity.unusable_password_hash()
    user.mfa_enabled, user.mfa_secret_enc, user.mfa_pending_secret_enc = False, None, None
    user.status, user.deleted_at = "deleted", now
    db.execute(delete(OneTimeToken).where(OneTimeToken.user_id == original_id))
    db.execute(delete(MfaRecoveryCode).where(MfaRecoveryCode.user_id == original_id))
    if account is not None:
        account.status, account.name = "closed", "Closed account"
        db.execute(
            update(Address)
            .where(Address.account_id == account.id)
            .values(
                deleted_at=now, name="[removed]", company=None, street1="[removed]", street2=None,
                phone=None, email=None, nickname=None, is_default_sender=False,
            )
        )  # fmt: skip
    audit.record(db, "account.closed", actor=user, entity_type="user", entity_id=original_id, request=request)
    db.commit()


# ------------------------------------------------------------------------------------- addresses


def address_out(address: Address) -> AddressOut:
    return AddressOut.model_validate({**address.__dict__, "verified": address.verified_at is not None})


def _get_address(db: Session, account: Account, address_id: uuid.UUID) -> Address:
    address = db.scalar(
        select(Address).where(Address.id == address_id, Address.account_id == account.id, Address.deleted_at.is_(None))
    )
    if address is None:  # 404 (not 403) for other accounts' addresses: do not reveal existence
        raise NotFound("address.not_found", "Address not found.")
    return address


def list_addresses(db: Session, account: Account, q: str | None, params: PageParams) -> tuple[list[Address], int]:
    stmt = select(Address).where(Address.account_id == account.id, Address.deleted_at.is_(None))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Address.nickname.ilike(like), Address.name.ilike(like), Address.company.ilike(like),
                Address.city.ilike(like), Address.postal_code.ilike(like), Address.street1.ilike(like),
            )
        )  # fmt: skip
    stmt = stmt.order_by(Address.is_default_sender.desc(), Address.nickname.nulls_last(), Address.created_at.desc())
    return paginate(db, stmt, params)


def _apply_verification(address: Address) -> None:
    result = get_shipping_provider().verify_address(
        AddressInput(
            street1=address.street1, street2=address.street2, city=address.city, region=address.region,
            postal_code=address.postal_code, country=address.country, name=address.name, company=address.company,
        )
    )  # fmt: skip
    if result.is_valid:
        address.verified_at = utcnow()
        address.verification_ref = result.verification_ref
    else:
        address.verified_at = None
        address.verification_ref = None


def _clear_default_sender(db: Session, account: Account, keep: uuid.UUID | None = None) -> None:
    stmt = update(Address).where(Address.account_id == account.id, Address.is_default_sender)
    if keep is not None:
        stmt = stmt.where(Address.id != keep)
    db.execute(stmt.values(is_default_sender=False))


def create_address(db: Session, user: User, account: Account, data: AddressIn, request: Request) -> Address:
    count = db.scalar(
        select(func.count()).select_from(Address).where(Address.account_id == account.id, Address.deleted_at.is_(None))
    )
    if (count or 0) >= 500:
        raise AppError("address.limit_reached", "Address book limit reached (500).", 409)
    if data.is_default_sender:
        _clear_default_sender(db, account)
    address = Address(account_id=account.id, **data.model_dump())
    _apply_verification(address)
    db.add(address)
    db.flush()
    audit.record(db, "address.created", actor=user, entity_type="address", entity_id=address.id, request=request)
    db.commit()
    return address


def update_address(
    db: Session, user: User, account: Account, address_id: uuid.UUID, data: AddressIn, request: Request
) -> Address:
    address = _get_address(db, account, address_id)
    if data.is_default_sender:
        _clear_default_sender(db, account, keep=address.id)
    for field, value in data.model_dump().items():
        setattr(address, field, value)
    _apply_verification(address)
    audit.record(db, "address.updated", actor=user, entity_type="address", entity_id=address.id, request=request)
    db.commit()
    return address


def delete_address(db: Session, user: User, account: Account, address_id: uuid.UUID, request: Request) -> None:
    address = _get_address(db, account, address_id)
    address.deleted_at = utcnow()
    address.is_default_sender = False
    audit.record(db, "address.deleted", actor=user, entity_type="address", entity_id=address.id, request=request)
    db.commit()
