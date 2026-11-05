"""Fixed-window rate limiting backed by PostgreSQL (no Redis; see docs/00-decisions.md D-008).

Counters are written in their own short transaction so they persist even when the request fails.
nginx ``limit_req`` provides a coarse per-IP limit in front of this in production.
"""

from datetime import UTC, datetime

from fastapi import Request
from sqlalchemy import DateTime, Integer, String, delete, func, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, engine
from app.core.errors import RateLimited


class RateLimitCounter(Base):
    __tablename__ = "rate_limit_counters"

    bucket: Mapped[str] = mapped_column(String(50), primary_key=True)
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


# bucket -> (max requests, window seconds)
LIMITS: dict[str, tuple[int, int]] = {
    "login_ip": (20, 300),
    "login_email": (10, 300),
    "register_ip": (10, 3600),
    "email_send": (5, 3600),
    "quote_ip": (60, 300),
    "verify_address": (60, 300),
}


def client_ip(request: Request) -> str:
    # nginx sets X-Real-IP; the app only listens on localhost behind nginx in production.
    return request.headers.get("X-Real-IP") or (request.client.host if request.client else "unknown")


def hit(bucket: str, key: str) -> None:
    """Count one request; raise RateLimited when the bucket's limit is exceeded."""
    limit, window = LIMITS[bucket]
    now = datetime.now(UTC)
    start_ts = int(now.timestamp()) // window * window
    window_start = datetime.fromtimestamp(start_ts, UTC)
    stmt = (
        insert(RateLimitCounter)
        .values(bucket=bucket, key=key[:200], window_start=window_start, count=1)
        .on_conflict_do_update(
            index_elements=["bucket", "key", "window_start"],
            set_={"count": RateLimitCounter.count + 1},
        )
        .returning(RateLimitCounter.count)
    )
    with engine.begin() as conn:
        count = conn.execute(stmt).scalar_one()
    if count > limit:
        raise RateLimited(retry_after=start_ts + window - int(now.timestamp()))


def prune() -> int:
    with engine.begin() as conn:
        result = conn.execute(
            delete(RateLimitCounter).where(RateLimitCounter.window_start < func.now() - text("interval '1 day'"))
        )
    return result.rowcount or 0
