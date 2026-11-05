from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog
from app.modules.identity.models import User


def record(
    db: Session,
    action: str,
    *,
    actor: User | None = None,
    entity_type: str | None = None,
    entity_id: object | None = None,
    request: Request | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Add an audit row to the current transaction (committed with the business change)."""
    ip = ua = None
    if request is not None:
        from app.core.deps import request_meta

        ip, ua = request_meta(request)
    actor_type = "system" if actor is None else ("staff" if actor.is_staff else "user")
    db.add(
        AuditLog(
            actor_user_id=actor.id if actor else None,
            actor_type=actor_type,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            ip=ip if ip and ip != "unknown" and ip != "testclient" else None,
            user_agent=ua,
            metadata_=metadata or {},
        )
    )
