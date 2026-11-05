"""FastAPI application factory."""

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import AppError, register_exception_handlers
from app.core.logging import configure_logging, request_context_middleware
from app.modules.accounts.router import router as accounts_router
from app.modules.admin.router import router as admin_router
from app.modules.identity.router import router as auth_router
from app.modules.quotes.router import router as quotes_router
from app.modules.reference.router import router as reference_router

API_PREFIX = "/api/v1"


async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if not request.url.path.startswith("/api/docs"):
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if get_settings().cookie_secure:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    return response


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url="/api/docs" if settings.app_mode != "production" else None,
        redoc_url=None,
    )
    register_exception_handlers(app)
    app.middleware("http")(security_headers)
    app.middleware("http")(request_context_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "X-Requested-With",
            "Accept-Language",
            "Idempotency-Key",
            "X-Request-ID",
        ],
    )

    api = APIRouter(prefix=API_PREFIX)

    # HEAD is allowed so uptime monitors and wait-on style checks (which default to HEAD) work.
    @api.api_route("/health", methods=["GET", "HEAD"], tags=["health"])
    def health() -> dict:
        return {"status": "ok"}

    @api.api_route("/ready", methods=["GET", "HEAD"], tags=["health"])
    def ready() -> dict:
        from alembic.config import Config
        from alembic.script import ScriptDirectory

        try:
            with engine.connect() as conn:
                current = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception:  # noqa: BLE001
            raise AppError("not_ready", "Database unavailable.", 503) from None
        head = ScriptDirectory.from_config(Config("alembic.ini")).get_current_head()
        if current != head:
            raise AppError(
                "not_ready", "Database migrations are not current.", 503, details={"current": current, "head": head}
            )
        return {"status": "ready", "mode": settings.app_mode, "migration": current}

    api.include_router(auth_router)
    api.include_router(accounts_router)
    api.include_router(reference_router)
    api.include_router(quotes_router)
    api.include_router(admin_router)
    if settings.is_development:
        from app.modules.notifications.dev_router import router as dev_router

        api.include_router(dev_router)
    app.include_router(api)
    return app


app = create_app()
