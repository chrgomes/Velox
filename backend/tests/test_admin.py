import pytest

from tests.conftest import PASSWORD, auth_header, create_staff, register, staff_token, token_from_email

PERMISSION_MATRIX = [
    # (path, method, super_admin, operations_admin, support)
    ("/api/v1/admin/dashboard", "GET", 200, 200, 200),
    ("/api/v1/admin/customers", "GET", 200, 200, 200),
    ("/api/v1/admin/staff", "GET", 200, 403, 403),
    ("/api/v1/admin/roles", "GET", 200, 403, 403),
    ("/api/v1/admin/audit-logs", "GET", 200, 403, 403),
    ("/api/v1/admin/settings", "GET", 200, 403, 403),
]


@pytest.mark.parametrize(("path", "method", "super_admin", "operations_admin", "support"), PERMISSION_MATRIX)
def test_permission_matrix(client, path, method, super_admin, operations_admin, support):
    for role, expected in (("super_admin", super_admin), ("operations_admin", operations_admin), ("support", support)):
        email, secret = create_staff(f"{role}@staff.example.com", role)
        token = staff_token(client, email, secret)
        assert client.request(method, path, headers=auth_header(token)).status_code == expected, (role, path)


def test_customers_cannot_use_admin_api(client):
    token = register(client)["access_token"]
    response = client.get("/api/v1/admin/dashboard", headers=auth_header(token))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.forbidden"


def test_staff_without_mfa_is_blocked_until_enabled(client):
    email, _ = create_staff("nomfa@staff.example.com", "super_admin", mfa=False)
    token = staff_token(client, email, None)
    me = client.get("/api/v1/customers/me", headers=auth_header(token)).json()
    assert me["mfa_setup_required"] is True
    response = client.get("/api/v1/admin/dashboard", headers=auth_header(token))
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "auth.staff_mfa_required"


def test_suspend_and_reactivate_customer(client):
    customer = register(client)
    customer_token = customer["access_token"]
    email, secret = create_staff("ops@staff.example.com", "operations_admin")
    token = staff_token(client, email, secret)

    no_reason = client.post(
        f"/api/v1/admin/customers/{customer['user']['id']}/suspend", json={}, headers=auth_header(token)
    )
    assert no_reason.status_code == 422
    suspended = client.post(
        f"/api/v1/admin/customers/{customer['user']['id']}/suspend",
        json={"reason": "Chargeback investigation"},
        headers=auth_header(token),
    )
    assert suspended.status_code == 200 and suspended.json()["status"] == "suspended"
    assert client.get("/api/v1/customers/me", headers=auth_header(customer_token)).status_code == 401

    client.post(
        f"/api/v1/admin/customers/{customer['user']['id']}/reactivate",
        json={"reason": "Resolved"},
        headers=auth_header(token),
    )
    login = client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD})
    assert login.status_code == 200


def test_support_cannot_suspend(client):
    customer = register(client)
    email, secret = create_staff("support@staff.example.com", "support")
    token = staff_token(client, email, secret)
    response = client.post(
        f"/api/v1/admin/customers/{customer['user']['id']}/suspend", json={"reason": "test"}, headers=auth_header(token)
    )
    assert response.status_code == 403


def test_customer_search_and_detail(client):
    register(client)
    register(client, email="bob@example.com", first_name="Bob")
    email, secret = create_staff("admin@staff.example.com", "super_admin")
    token = staff_token(client, email, secret)
    found = client.get("/api/v1/admin/customers?q=bob", headers=auth_header(token)).json()
    assert found["total"] == 1
    detail = client.get(f"/api/v1/admin/customers/{found['items'][0]['id']}", headers=auth_header(token)).json()
    assert detail["email"] == "bob@example.com"
    assert any(a["action"] == "auth.register" for a in detail["recent_activity"])
    # Staff users are not customers.
    staff_list = client.get("/api/v1/admin/customers?q=staff.example.com", headers=auth_header(token)).json()
    assert staff_list["total"] == 0


def test_staff_invitation_flow(client):
    email, secret = create_staff("admin@staff.example.com", "super_admin")
    token = staff_token(client, email, secret)
    created = client.post(
        "/api/v1/admin/staff",
        json={"email": "new.agent@staff.example.com", "first_name": "New", "last_name": "Agent", "roles": ["support"]},
        headers=auth_header(token),
    )
    assert created.status_code == 201 and created.json()["invitation_pending"] is True
    bad_role = client.post(
        "/api/v1/admin/staff",
        json={"email": "x@staff.example.com", "first_name": "X", "last_name": "Y", "roles": ["god_mode"]},
        headers=auth_header(token),
    )
    assert bad_role.status_code == 422

    invite = token_from_email("new.agent@staff.example.com", "staff_invite")
    assert (
        client.post(
            "/api/v1/auth/password/reset", json={"token": invite, "new_password": "Agent-Secret-123"}
        ).status_code
        == 204
    )
    login = client.post(
        "/api/v1/auth/login", json={"email": "new.agent@staff.example.com", "password": "Agent-Secret-123"}
    )
    assert login.status_code == 200
    assert login.json()["user"]["mfa_setup_required"] is True


def test_last_super_admin_cannot_be_removed_or_self_suspended(client):
    email, secret = create_staff("admin@staff.example.com", "super_admin")
    token = staff_token(client, email, secret)
    me = client.get("/api/v1/customers/me", headers=auth_header(token)).json()
    demote = client.patch(f"/api/v1/admin/staff/{me['id']}", json={"roles": ["support"]}, headers=auth_header(token))
    assert demote.status_code == 409 and demote.json()["error"]["code"] == "staff.last_super_admin"
    suspend = client.patch(f"/api/v1/admin/staff/{me['id']}", json={"status": "suspended"}, headers=auth_header(token))
    assert suspend.json()["error"]["code"] == "staff.cannot_suspend_self"


def test_settings_validation_and_registration_switch(client):
    email, secret = create_staff("admin@staff.example.com", "super_admin")
    token = staff_token(client, email, secret)
    assert client.patch("/api/v1/admin/settings", json={"nope": 1}, headers=auth_header(token)).status_code == 422
    assert (
        client.patch("/api/v1/admin/settings", json={"registration_open": "no"}, headers=auth_header(token)).status_code
        == 422
    )
    ok = client.patch("/api/v1/admin/settings", json={"registration_open": False}, headers=auth_header(token))
    assert ok.status_code == 200 and ok.json()["registration_open"] is False
    closed = client.post(
        "/api/v1/auth/register",
        json={
            "email": "late@example.com",
            "password": PASSWORD,
            "first_name": "L",
            "last_name": "T",
            "country": "US",
            "accept_terms": True,
        },
    )
    assert closed.status_code == 403 and closed.json()["error"]["code"] == "auth.registration_closed"


def test_audit_log_records_admin_actions(client):
    customer = register(client)
    email, secret = create_staff("admin@staff.example.com", "super_admin")
    token = staff_token(client, email, secret)
    client.post(
        f"/api/v1/admin/customers/{customer['user']['id']}/suspend",
        json={"reason": "fraud check"},
        headers=auth_header(token),
    )
    logs = client.get("/api/v1/admin/audit-logs?action=customer.", headers=auth_header(token)).json()
    assert logs["total"] == 1
    entry = logs["items"][0]
    assert entry["actor_email"] == "admin@staff.example.com" and entry["metadata"]["reason"] == "fraud check"
