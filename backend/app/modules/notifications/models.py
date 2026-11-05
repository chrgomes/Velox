import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Timestamps, UUIDPk

# Event types a customer can opt in/out of. Security emails (verification, reset) are always sent.
NOTIFICATION_EVENTS = (
    "label_purchased",
    "tracking_out_for_delivery",
    "tracking_delivered",
    "tracking_exception",
    "refund_processed",
    "marketing",
)
NOTIFICATION_DEFAULTS = {event: event != "marketing" for event in NOTIFICATION_EVENTS}


class NotificationPreference(Timestamps, Base):
    __tablename__ = "notification_preferences"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(50), primary_key=True)
    channel: Mapped[str] = mapped_column(String(10), primary_key=True, default="email")
    enabled: Mapped[bool] = mapped_column(Boolean)


class EmailMessage(UUIDPk, Timestamps, Base):
    """Outbox: rows are inserted in the same transaction as the business change, then sent by the worker."""

    __tablename__ = "email_messages"
    __table_args__ = (
        CheckConstraint("status IN ('queued','sending','sent','failed')", name="status"),
        Index("ix_email_messages_queued", "created_at", postgresql_where=text("status = 'queued'")),
        Index("ix_email_messages_to_address", "to_address"),
    )

    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    to_address: Mapped[str] = mapped_column(String(320))
    template: Mapped[str] = mapped_column(String(50))
    locale: Mapped[str] = mapped_column(String(10))
    subject: Mapped[str] = mapped_column(Text)
    body_text: Mapped[str] = mapped_column(Text)
    body_html: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="queued")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    provider_message_id: Mapped[str | None] = mapped_column(String(100))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
