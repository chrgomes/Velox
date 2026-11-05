"""Error envelope and exception handlers.

Every error response has the shape::

    {"error": {"code": "...", "message": "...", "details": {...}, "request_id": "..."}}

``code`` is stable and is what the frontend translates; ``message`` is English for developers.
"""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.headers = headers


class NotFound(AppError):
    def __init__(self, code: str = "not_found", message: str = "Resource not found.") -> None:
        super().__init__(code, message, status.HTTP_404_NOT_FOUND)


class Unauthorized(AppError):
    def __init__(self, code: str = "auth.unauthenticated", message: str = "Authentication required.") -> None:
        super().__init__(code, message, status.HTTP_401_UNAUTHORIZED, headers={"WWW-Authenticate": "Bearer"})


class Forbidden(AppError):
    def __init__(self, code: str = "auth.forbidden", message: str = "You do not have permission to do this.") -> None:
        super().__init__(code, message, status.HTTP_403_FORBIDDEN)


class Conflict(AppError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(code, message, status.HTTP_409_CONFLICT)


class RateLimited(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many requests. Please try again later.",
            status.HTTP_429_TOO_MANY_REQUESTS,
            details={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


def _envelope(request: Request, code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
            "request_id": getattr(request.state, "request_id", None),
        }
    }


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            _envelope(request, exc.code, exc.message, exc.details),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = [
            {
                "field": ".".join(str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")),
                "type": err.get("type"),
                "message": err.get("msg"),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            _envelope(request, "validation_error", "The request contains invalid data.", {"fields": fields}),
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed", 401: "auth.unauthenticated"}.get(
            exc.status_code, "http_error"
        )
        return JSONResponse(
            _envelope(request, code, str(exc.detail)),
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )
