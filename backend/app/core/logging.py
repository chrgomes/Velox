"""Structured JSON logging with request ids and PII redaction."""

import json
import logging
import re
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar

from fastapi import Request, Response

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")


def redact(text: str) -> str:
    return _EMAIL_RE.sub("[email]", text)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        data = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": redact(record.getMessage()),
            "request_id": request_id_var.get(),
        }
        for key in ("method", "path", "status", "duration_ms"):
            if hasattr(record, key):
                data[key] = getattr(record, key)
        if record.exc_info:
            data["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(data)


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    logging.getLogger("uvicorn.access").disabled = True


access_log = logging.getLogger("velox.access")


async def request_context_middleware(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
    incoming = request.headers.get("X-Request-ID", "")
    request_id = incoming if re.fullmatch(r"[A-Za-z0-9-]{8,64}", incoming) else uuid.uuid4().hex
    request.state.request_id = request_id
    token = request_id_var.set(request_id)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        request_id_var.reset(token)
    response.headers["X-Request-ID"] = request_id
    access_log.info(
        "request",
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": round((time.perf_counter() - start) * 1000, 1),
        },
    )
    return response
