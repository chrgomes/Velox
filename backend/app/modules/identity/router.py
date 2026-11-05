import uuid
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Header, Request, Response, status
from sqlalchemy import select

from app.core.config import get_settings
from app.core.deps import DB, Auth, CurrentUser
from app.core.errors import AppError, NotFound
from app.modules.audit import service as audit
from app.modules.identity import service
from app.modules.identity.models import RefreshToken
from app.modules.identity.schemas import (
    ChangePasswordIn,
    EmailIn,
    LoginIn,
    MeOut,
    MfaChallengeOut,
    MfaCodeIn,
    MfaDisableIn,
    MfaLoginIn,
    MfaSetupOut,
    RecoveryCodesOut,
    RegisterIn,
    ResetPasswordIn,
    SessionOut,
    TokenIn,
    TokenOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "velox_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, raw: str) -> None:
    settings = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_days * 86400,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
    )


def _clear_refresh_cookie(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, httponly=True, secure=settings.cookie_secure, samesite="strict"
    )


def require_xhr(x_requested_with: Annotated[str | None, Header()] = None) -> None:
    """CSRF defence for cookie-authenticated endpoints (in addition to SameSite=Strict)."""
    if x_requested_with != "XMLHttpRequest":
        raise AppError("auth.csrf_header_missing", "Missing X-Requested-With header.", 403)


RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]


def _token_response(response: Response, issued: service.IssuedSession, user) -> TokenOut:
    _set_refresh_cookie(response, issued.refresh_token)
    response.headers["Cache-Control"] = "no-store"
    return TokenOut(access_token=issued.access_token, expires_in=issued.expires_in, user=service.me_out(user))


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=TokenOut)
def register(data: RegisterIn, request: Request, response: Response, db: DB) -> TokenOut:
    user = service.register(db, data, request)
    issued = service.issue_session(db, user, request)
    db.commit()
    return _token_response(response, issued, user)


@router.post("/verify-email", response_model=MeOut)
def verify_email(data: TokenIn, request: Request, db: DB) -> MeOut:
    return service.me_out(service.verify_email(db, data.token, request))


@router.post("/resend-verification", status_code=status.HTTP_202_ACCEPTED)
def resend_verification(data: EmailIn, request: Request, db: DB) -> dict:
    service.resend_verification(db, data.email, request)
    return {"status": "accepted"}


@router.post("/login", response_model=TokenOut | MfaChallengeOut)
def login(data: LoginIn, request: Request, response: Response, db: DB) -> TokenOut | MfaChallengeOut:
    user = service.authenticate(db, data.email, data.password, request)
    if user.mfa_enabled:
        token = service.start_mfa_challenge(db, user)
        db.commit()
        return MfaChallengeOut(mfa_token=token)
    issued = service.issue_session(db, user, request)
    audit.record(db, "auth.login", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()
    return _token_response(response, issued, user)


@router.post("/login/mfa", response_model=TokenOut)
def login_mfa(data: MfaLoginIn, request: Request, response: Response, db: DB) -> TokenOut:
    user = service.complete_mfa_challenge(db, data.mfa_token, data.code, request)
    issued = service.issue_session(db, user, request)
    audit.record(
        db, "auth.login", actor=user, entity_type="user", entity_id=user.id, request=request, metadata={"mfa": True}
    )
    db.commit()
    return _token_response(response, issued, user)


@router.post("/refresh", response_model=TokenOut, dependencies=[Depends(require_xhr)])
def refresh(request: Request, response: Response, db: DB, velox_refresh: RefreshCookie = None) -> TokenOut:
    try:
        issued, user = service.rotate_refresh_token(db, velox_refresh, request)
    except AppError:
        _clear_refresh_cookie(response)
        raise
    return _token_response(response, issued, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_xhr)])
def logout(response: Response, db: DB, velox_refresh: RefreshCookie = None) -> Response:
    service.end_session(db, velox_refresh)
    response.status_code = status.HTTP_204_NO_CONTENT
    _clear_refresh_cookie(response)
    return response


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(request: Request, response: Response, db: DB, user: CurrentUser) -> Response:
    service.revoke_all_sessions(db, user)
    audit.record(db, "auth.logout_all", actor=user, entity_type="user", entity_id=user.id, request=request)
    db.commit()
    response.status_code = status.HTTP_204_NO_CONTENT
    _clear_refresh_cookie(response)
    return response


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(data: EmailIn, request: Request, db: DB) -> dict:
    service.forgot_password(db, data.email, request)
    return {"status": "accepted"}


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: ResetPasswordIn, request: Request, db: DB) -> Response:
    service.reset_password(db, data.token, data.new_password, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/password/change", status_code=status.HTTP_204_NO_CONTENT)
def change_password(data: ChangePasswordIn, request: Request, db: DB, auth: Auth) -> Response:
    service.change_password(db, auth.user, data.current_password, data.new_password, auth.session_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/mfa/setup", response_model=MfaSetupOut)
def mfa_setup(db: DB, user: CurrentUser) -> dict:
    return service.mfa_setup(db, user)


@router.post("/mfa/enable", response_model=RecoveryCodesOut)
def mfa_enable(data: MfaCodeIn, request: Request, db: DB, user: CurrentUser) -> RecoveryCodesOut:
    return RecoveryCodesOut(recovery_codes=service.mfa_enable(db, user, data.code, request))


@router.post("/mfa/disable", status_code=status.HTTP_204_NO_CONTENT)
def mfa_disable(data: MfaDisableIn, request: Request, db: DB, user: CurrentUser) -> Response:
    service.mfa_disable(db, user, data.password, data.code, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/mfa/recovery-codes", response_model=RecoveryCodesOut)
def mfa_recovery_codes(data: MfaCodeIn, request: Request, db: DB, user: CurrentUser) -> RecoveryCodesOut:
    return RecoveryCodesOut(recovery_codes=service.regenerate_recovery_codes(db, user, data.code, request))


@router.get("/sessions", response_model=list[SessionOut])
def sessions(db: DB, auth: Auth) -> list[dict]:
    return service.list_sessions(db, auth.user, auth.session_id)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: uuid.UUID, request: Request, db: DB, user: CurrentUser) -> Response:
    owned = db.scalar(
        select(RefreshToken.id).where(RefreshToken.family_id == session_id, RefreshToken.user_id == user.id).limit(1)
    )
    if owned is None:
        raise NotFound()
    service.revoke_family(db, session_id)
    audit.record(db, "auth.session_revoked", actor=user, entity_type="session", entity_id=session_id, request=request)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
