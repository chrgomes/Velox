"""Development-only mailbox. Mounted only when VELOX_APP_MODE=development.

Lets developers and end-to-end tests read emails sent by the console provider
(e.g. to follow a verification link) without a real mail server.
"""

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import EmailStr
from sqlalchemy import select

from app.core.deps import DB
from app.modules.notifications.models import EmailMessage

router = APIRouter(prefix="/dev", tags=["development"])


@router.get("/emails")
def emails(db: DB, to: Annotated[EmailStr, Query()], limit: Annotated[int, Query(ge=1, le=20)] = 5) -> list[dict]:
    rows = db.scalars(
        select(EmailMessage)
        .where(EmailMessage.to_address == to.lower())
        .order_by(EmailMessage.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "template": m.template,
            "subject": m.subject,
            "body_text": m.body_text,
            "status": m.status,
            "created_at": m.created_at,
        }
        for m in rows
    ]
