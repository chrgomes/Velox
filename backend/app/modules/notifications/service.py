"""Email rendering, outbox queueing, sending and notification preferences."""

import html
import logging
import uuid
from dataclasses import dataclass

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import SessionLocal, utcnow
from app.core.i18n import normalize_locale, t
from app.integrations.email.base import EmailProvider, OutgoingEmail, get_email_provider
from app.modules.identity.models import User
from app.modules.notifications.models import (
    NOTIFICATION_DEFAULTS,
    NOTIFICATION_EVENTS,
    EmailMessage,
    NotificationPreference,
)

log = logging.getLogger("velox.notifications")

MAX_ATTEMPTS = 5


@dataclass
class TemplateSpec:
    paragraphs: tuple[str, ...]
    action_key: str | None = None


# template name -> translation keys under email.<template>.*
TEMPLATES: dict[str, TemplateSpec] = {
    "verify_email": TemplateSpec(("intro", "expiry"), "action"),
    "reset_password": TemplateSpec(("intro", "expiry", "ignore"), "action"),
    "password_changed": TemplateSpec(("body", "not_you")),
    "mfa_enabled": TemplateSpec(("body", "not_you")),
    "mfa_disabled": TemplateSpec(("body", "not_you")),
    "staff_invite": TemplateSpec(("intro", "expiry"), "action"),
    "account_closed": TemplateSpec(("body",)),
}


def render(template: str, locale: str, name: str, action_url: str | None = None) -> tuple[str, str, str]:
    spec = TEMPLATES[template]
    app = get_settings().app_name
    loc = normalize_locale(locale)
    subject = t(f"email.{template}.subject", loc, app=app)
    greeting = t("email.greeting", loc, name=name)
    paragraphs = [t(f"email.{template}.{p}", loc, app=app) for p in spec.paragraphs]
    action_label = t(f"email.{template}.{spec.action_key}", loc) if spec.action_key else None
    signoff = t("email.signoff", loc, app=app)

    text_parts = [greeting, *paragraphs]
    if action_label and action_url:
        text_parts.append(f"{action_label}: {action_url}")
    text_parts.append(signoff)
    text = "\n\n".join(text_parts)

    esc = html.escape
    button = ""
    if action_label and action_url:
        button = (
            f'<p><a href="{esc(action_url, quote=True)}" style="display:inline-block;background:#1E40AF;'
            f'color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">'
            f"{esc(action_label)}</a></p>"
            f'<p style="font-size:13px;color:#4B5563">{esc(action_url)}</p>'
        )
    body = "".join(f"<p>{esc(p)}</p>" for p in paragraphs)
    html_doc = (
        f'<!doctype html><html lang="{esc(loc)}"><body style="margin:0;background:#F9FAFB;'
        f'font-family:Inter,Segoe UI,Roboto,sans-serif;color:#111827">'
        f'<div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff">'
        f'<p style="font-size:20px;font-weight:700;color:#1E40AF">{esc(app)}</p>'
        f"<p>{esc(greeting)}</p>{body}{button}<p>{esc(signoff)}</p></div></body></html>"
    )
    return subject, text, html_doc


def queue_email(
    db: Session,
    template: str,
    *,
    to: str,
    locale: str,
    name: str,
    user_id: uuid.UUID | None = None,
    action_url: str | None = None,
) -> EmailMessage:
    subject, text, html_doc = render(template, locale, name, action_url)
    message = EmailMessage(
        user_id=user_id,
        to_address=to,
        template=template,
        locale=normalize_locale(locale),
        subject=subject,
        body_text=text,
        body_html=html_doc,
        status="queued",
    )
    db.add(message)
    return message


def web_url(path: str) -> str:
    return get_settings().public_web_url.rstrip("/") + path


def send_pending(limit: int = 20, provider: EmailProvider | None = None) -> int:
    """Send queued emails. Safe to run in several workers at once (SKIP LOCKED)."""
    provider = provider or get_email_provider()
    sent = 0
    with SessionLocal() as db:
        rows = db.scalars(
            select(EmailMessage)
            .where(EmailMessage.status == "queued")
            .order_by(EmailMessage.created_at)
            .limit(limit)
            .with_for_update(skip_locked=True)
        ).all()
        for message in rows:
            message.attempts += 1
            try:
                message.provider_message_id = provider.send(
                    OutgoingEmail(message.to_address, message.subject, message.body_text, message.body_html)
                )
            except Exception as exc:  # noqa: BLE001 - any provider failure is retried
                message.last_error = str(exc)[:1000]
                message.status = "failed" if message.attempts >= MAX_ATTEMPTS else "queued"
                log.warning("email send failed (attempt %s): %s", message.attempts, exc)
                continue
            message.status = "sent"
            message.sent_at = utcnow()
            message.last_error = None
            if provider.code != "console":
                # Bodies can contain one-time links; do not keep them once delivered.
                message.body_text = message.body_html = "[removed after delivery]"
            sent += 1
        db.commit()
    return sent


def get_preferences(db: Session, user: User) -> dict[str, bool]:
    stored = {
        p.event_type: p.enabled
        for p in db.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user.id, NotificationPreference.channel == "email"
            )
        )
    }
    return {event: stored.get(event, NOTIFICATION_DEFAULTS[event]) for event in NOTIFICATION_EVENTS}


def set_preferences(db: Session, user: User, values: dict[str, bool]) -> dict[str, bool]:
    for event, enabled in values.items():
        if event not in NOTIFICATION_EVENTS:
            continue
        pref = db.get(NotificationPreference, (user.id, event, "email"))
        if pref is None:
            db.add(NotificationPreference(user_id=user.id, event_type=event, channel="email", enabled=enabled))
        else:
            pref.enabled = enabled
    db.flush()
    return get_preferences(db, user)


def mark_user_emails_failed(db: Session, user_id: uuid.UUID) -> None:
    """Stop queued emails for a closed account."""
    db.execute(
        update(EmailMessage)
        .where(EmailMessage.user_id == user_id, EmailMessage.status == "queued")
        .values(status="failed", last_error="account closed")
    )
