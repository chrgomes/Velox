from datetime import timedelta

from sqlalchemy import select

from app.core.db import SessionLocal, utcnow
from app.core.security import decrypt
from app.modules.identity.models import User
from tests.conftest import PASSWORD, auth_header, last_email, login, register, token_from_email, totp_code

REFRESH = "/api/v1/auth/refresh"


def test_register_creates_session_account_and_verification_email(client):
    body = register(client)
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["email_verified"] is False
    assert "velox_refresh" in client.cookies
    me = client.get("/api/v1/customers/me", headers=auth_header(body["access_token"])).json()
    assert me["account"]["default_currency"] == "CAD"
    assert last_email("alice@example.com", "verify_email").locale == "en"


def test_register_normalizes_email_and_rejects_duplicates_generically(client):
    register(client, email="Bob@Example.com")
    response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "bob@example.com",
            "password": PASSWORD,
            "first_name": "B",
            "last_name": "C",
            "country": "US",
            "accept_terms": True,
        },
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "auth.registration_failed"


def test_register_validation(client):
    base = {"email": "c@example.com", "first_name": "C", "last_name": "D", "country": "CA", "accept_terms": True}
    assert client.post("/api/v1/auth/register", json={**base, "password": "short"}).status_code == 422
    weak = client.post("/api/v1/auth/register", json={**base, "password": "password123"})
    assert weak.json()["error"]["code"] == "auth.password_weak"
    no_terms = client.post("/api/v1/auth/register", json={**base, "password": PASSWORD, "accept_terms": False})
    assert no_terms.status_code == 422
    bad_country = client.post("/api/v1/auth/register", json={**base, "password": PASSWORD, "country": "MX"})
    assert bad_country.status_code == 422


def test_login_errors_do_not_reveal_whether_account_exists(client):
    register(client)
    wrong = client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": "nope-nope-nope"})
    unknown = client.post("/api/v1/auth/login", json={"email": "nobody@example.com", "password": "nope-nope-nope"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"]["code"] == unknown.json()["error"]["code"] == "auth.invalid_credentials"


def test_lockout_after_repeated_failures(client):
    register(client)
    for _ in range(5):
        client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": "wrong-password-1"})
    locked = client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "auth.account_locked"
    assert int(locked.headers["Retry-After"]) > 0


def test_refresh_rotates_and_detects_reuse(client):
    register(client)
    original = client.cookies.get("velox_refresh")
    first = client.post(REFRESH)
    assert first.status_code == 200
    rotated = client.cookies.get("velox_refresh")
    assert rotated and rotated != original

    # Replaying the old token ends the whole session (theft detection).
    client.cookies.set("velox_refresh", original, path="/api/v1/auth")
    replay = client.post(REFRESH)
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "auth.session_revoked"
    client.cookies.set("velox_refresh", rotated, path="/api/v1/auth")
    assert client.post(REFRESH).status_code == 401
    assert client.get("/api/v1/customers/me", headers=auth_header(first.json()["access_token"])).status_code == 401


def test_refresh_requires_csrf_header(client):
    register(client)
    response = client.post(REFRESH, headers={"X-Requested-With": ""})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.csrf_header_missing"


def test_logout_ends_session_immediately(client):
    token = register(client)["access_token"]
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/customers/me", headers=auth_header(token)).status_code == 401
    assert client.post(REFRESH).status_code == 401


def test_invalid_and_missing_tokens(client):
    assert client.get("/api/v1/customers/me").status_code == 401
    bad = client.get("/api/v1/customers/me", headers=auth_header("not-a-jwt"))
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "auth.invalid_token"


def test_email_verification_is_single_use(client):
    register(client)
    token = token_from_email("alice@example.com", "verify_email")
    ok = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert ok.status_code == 200 and ok.json()["email_verified"] is True
    again = client.post("/api/v1/auth/verify-email", json={"token": token})
    assert again.status_code == 400
    assert again.json()["error"]["code"] == "auth.token_invalid"


def test_resend_verification_always_accepted(client):
    assert client.post("/api/v1/auth/resend-verification", json={"email": "ghost@example.com"}).status_code == 202


def test_password_reset_flow(client):
    token = register(client)["access_token"]
    assert client.post("/api/v1/auth/password/forgot", json={"email": "ghost@example.com"}).status_code == 202
    assert client.post("/api/v1/auth/password/forgot", json={"email": "alice@example.com"}).status_code == 202
    reset_token = token_from_email("alice@example.com", "reset_password")

    new_password = "Brand-New-Secret-9"
    done = client.post("/api/v1/auth/password/reset", json={"token": reset_token, "new_password": new_password})
    assert done.status_code == 204
    # All sessions end, the token cannot be reused, and only the new password works.
    assert client.get("/api/v1/customers/me", headers=auth_header(token)).status_code == 401
    reuse = client.post("/api/v1/auth/password/reset", json={"token": reset_token, "new_password": "Another-One-77"})
    assert reuse.status_code == 400
    assert (
        client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 401
    )
    login(client, "alice@example.com", new_password)
    assert last_email("alice@example.com", "password_changed")


def test_expired_reset_token_rejected(client):
    register(client)
    client.post("/api/v1/auth/password/forgot", json={"email": "alice@example.com"})
    reset_token = token_from_email("alice@example.com", "reset_password")
    from app.modules.identity.models import OneTimeToken

    with SessionLocal() as db:
        for row in db.scalars(select(OneTimeToken)):
            row.expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    response = client.post(
        "/api/v1/auth/password/reset", json={"token": reset_token, "new_password": "Brand-New-Secret-9"}
    )
    assert response.status_code == 400


def test_change_password_keeps_current_session_and_ends_others(client):
    first = register(client)["access_token"]
    second = login(client, "alice@example.com")["access_token"]
    wrong = client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "wrong-password", "new_password": "Brand-New-Secret-9"},
        headers=auth_header(second),
    )
    assert wrong.status_code == 400
    ok = client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": "Brand-New-Secret-9"},
        headers=auth_header(second),
    )
    assert ok.status_code == 204
    assert client.get("/api/v1/customers/me", headers=auth_header(second)).status_code == 200
    assert client.get("/api/v1/customers/me", headers=auth_header(first)).status_code == 401


def test_sessions_list_and_revoke(client):
    first = register(client)["access_token"]
    second = login(client, "alice@example.com")["access_token"]
    sessions = client.get("/api/v1/auth/sessions", headers=auth_header(second)).json()
    assert len(sessions) == 2
    other = next(s for s in sessions if not s["current"])
    assert client.delete(f"/api/v1/auth/sessions/{other['id']}", headers=auth_header(second)).status_code == 204
    assert client.get("/api/v1/customers/me", headers=auth_header(first)).status_code == 401


def test_cannot_revoke_someone_elses_session(client):
    alice = register(client)["access_token"]
    bob = register(client, email="bob@example.com")["access_token"]
    bob_session = client.get("/api/v1/auth/sessions", headers=auth_header(bob)).json()[0]["id"]
    assert client.delete(f"/api/v1/auth/sessions/{bob_session}", headers=auth_header(alice)).status_code == 404


def _enable_mfa(client, token: str) -> tuple[str, list[str]]:
    setup = client.post("/api/v1/auth/mfa/setup", headers=auth_header(token)).json()
    assert setup["qr_svg"].startswith("<")
    codes = client.post(
        "/api/v1/auth/mfa/enable", json={"code": totp_code(setup["secret"])}, headers=auth_header(token)
    )
    assert codes.status_code == 200, codes.text
    return setup["secret"], codes.json()["recovery_codes"]


def test_mfa_enable_login_and_replay_protection(client):
    token = register(client)["access_token"]
    secret, recovery = _enable_mfa(client, token)
    assert len(recovery) == 10

    challenge = login(client, "alice@example.com")
    assert challenge["mfa_required"] is True and "access_token" not in challenge
    bad = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge["mfa_token"], "code": "000000"})
    assert bad.status_code == 401

    code = totp_code(secret, offset_steps=1)
    ok = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge["mfa_token"], "code": code})
    assert ok.status_code == 200
    # Same code cannot be replayed with a new challenge, and the challenge token is single use.
    challenge2 = login(client, "alice@example.com")
    replay = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge2["mfa_token"], "code": code})
    assert replay.status_code == 401
    reused = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge["mfa_token"], "code": code})
    assert reused.json()["error"]["code"] == "auth.mfa_token_invalid"


def test_mfa_recovery_code_is_single_use(client):
    token = register(client)["access_token"]
    _, recovery = _enable_mfa(client, token)
    challenge = login(client, "alice@example.com")
    ok = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge["mfa_token"], "code": recovery[0].upper()})
    assert ok.status_code == 200
    challenge = login(client, "alice@example.com")
    again = client.post("/api/v1/auth/login/mfa", json={"mfa_token": challenge["mfa_token"], "code": recovery[0]})
    assert again.status_code == 401


def test_mfa_secret_encrypted_at_rest_and_disable(client):
    token = register(client)["access_token"]
    secret, recovery = _enable_mfa(client, token)
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "alice@example.com"))
        assert secret.encode() not in user.mfa_secret_enc
        assert decrypt(user.mfa_secret_enc) == secret
    wrong_pw = client.post(
        "/api/v1/auth/mfa/disable", json={"password": "nope", "code": recovery[1]}, headers=auth_header(token)
    )
    assert wrong_pw.status_code == 400
    ok = client.post(
        "/api/v1/auth/mfa/disable", json={"password": PASSWORD, "code": recovery[1]}, headers=auth_header(token)
    )
    assert ok.status_code == 204
    assert "access_token" in login(client, "alice@example.com")


def test_suspended_user_cannot_log_in(client):
    token = register(client)["access_token"]
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == "alice@example.com"))
        user.status = "suspended"
        db.commit()
    assert client.get("/api/v1/customers/me", headers=auth_header(token)).status_code == 401
    response = client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.account_suspended"


def test_login_rate_limited_per_email(client):
    register(client)
    codes = {
        client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code
        for _ in range(11)
    }
    assert 429 in codes
