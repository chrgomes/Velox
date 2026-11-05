import logging
from dataclasses import dataclass
from typing import Protocol

import httpx

from app.core.config import get_settings

log = logging.getLogger("velox.email")


@dataclass
class OutgoingEmail:
    to: str
    subject: str
    text: str
    html: str


class EmailProvider(Protocol):
    code: str

    def send(self, message: OutgoingEmail) -> str:
        """Send one email and return the provider's message id. Raises on failure."""
        ...


class ConsoleEmailProvider:
    """Development provider: logs instead of sending. Messages stay readable in ``email_messages``."""

    code = "console"

    def send(self, message: OutgoingEmail) -> str:
        log.info("console email: %s", message.subject)
        return "console"


class PostmarkEmailProvider:
    code = "postmark"
    endpoint = "https://api.postmarkapp.com/email"

    def __init__(self, server_token: str, sender: str) -> None:
        if not server_token:
            raise RuntimeError("VELOX_POSTMARK_SERVER_TOKEN is not set")
        self._token = server_token
        self._sender = sender

    def send(self, message: OutgoingEmail) -> str:
        response = httpx.post(
            self.endpoint,
            headers={"X-Postmark-Server-Token": self._token, "Accept": "application/json"},
            json={
                "From": self._sender,
                "To": message.to,
                "Subject": message.subject,
                "TextBody": message.text,
                "HtmlBody": message.html,
                "MessageStream": "outbound",
            },
            timeout=15,
        )
        response.raise_for_status()
        return str(response.json().get("MessageID", ""))


def get_email_provider() -> EmailProvider:
    settings = get_settings()
    if settings.email_provider == "postmark":
        return PostmarkEmailProvider(settings.postmark_server_token, settings.email_from)
    return ConsoleEmailProvider()
