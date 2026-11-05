import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Timestamps, UUIDPk


class Account(UUIDPk, Timestamps, Base):
    """Billing entity that owns addresses (and, from Phase 2, shipments and payments)."""

    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint("type IN ('individual','business')", name="type"),
        CheckConstraint("status IN ('active','suspended','closed')", name="status"),
        CheckConstraint("default_currency IN ('CAD','USD')", name="currency"),
    )

    type: Mapped[str] = mapped_column(String(20), default="individual")
    name: Mapped[str] = mapped_column(String(200))
    country: Mapped[str] = mapped_column(String(2))
    default_currency: Mapped[str] = mapped_column(String(3))
    status: Mapped[str] = mapped_column(String(20), default="active")
    payment_customer_ref: Mapped[str | None] = mapped_column(String(100), unique=True)


class AccountMember(Timestamps, Base):
    __tablename__ = "account_members"
    __table_args__ = (
        CheckConstraint("role IN ('owner','admin','shipper','viewer')", name="role"),
        Index("ix_account_members_user_id", "user_id"),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), default="owner")


class Address(UUIDPk, Timestamps, Base):
    __tablename__ = "addresses"
    __table_args__ = (
        CheckConstraint("country IN ('US','CA')", name="country"),
        CheckConstraint("coalesce(name, '') <> '' OR coalesce(company, '') <> ''", name="name_or_company"),
        Index("ix_addresses_account_active", "account_id", postgresql_where=text("deleted_at IS NULL")),
        Index(
            "uq_addresses_default_sender",
            "account_id",
            unique=True,
            postgresql_where=text("is_default_sender AND deleted_at IS NULL"),
        ),
    )

    account_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    nickname: Mapped[str | None] = mapped_column(String(100))
    name: Mapped[str | None] = mapped_column(String(200))
    company: Mapped[str | None] = mapped_column(String(200))
    street1: Mapped[str] = mapped_column(String(200))
    street2: Mapped[str | None] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100))
    region: Mapped[str] = mapped_column(String(3))
    postal_code: Mapped[str] = mapped_column(String(10))
    country: Mapped[str] = mapped_column(String(2))
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(320))
    is_residential: Mapped[bool] = mapped_column(Boolean, default=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_ref: Mapped[str | None] = mapped_column(String(100))
    is_default_sender: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
