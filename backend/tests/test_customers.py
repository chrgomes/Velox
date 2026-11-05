from tests.conftest import PASSWORD, auth_header, register

ADDRESS = {
    "nickname": "Office",
    "name": "Alice Martin",
    "street1": "100 queen st w",
    "city": "toronto",
    "region": "on",
    "postal_code": "m5h2n2",
    "country": "CA",
}


def test_profile_update_and_validation(client):
    token = register(client)["access_token"]
    ok = client.patch(
        "/api/v1/customers/me",
        json={"first_name": "Alicia", "locale": "fr-CA", "timezone": "America/Montreal", "phone": "+1 416 555 0100"},
        headers=auth_header(token),
    )
    assert ok.status_code == 200
    body = ok.json()
    assert body["first_name"] == "Alicia" and body["locale"] == "fr-CA"
    assert body["account"]["name"] == "Alicia Martin"
    assert (
        client.patch("/api/v1/customers/me", json={"timezone": "Mars/Base"}, headers=auth_header(token)).status_code
        == 422
    )
    assert client.patch("/api/v1/customers/me", json={"locale": "de"}, headers=auth_header(token)).status_code == 422
    # Email and staff flags cannot be changed through the profile endpoint.
    client.patch("/api/v1/customers/me", json={"email": "x@example.com", "is_staff": True}, headers=auth_header(token))
    me = client.get("/api/v1/customers/me", headers=auth_header(token)).json()
    assert me["email"] == "alice@example.com" and me["is_staff"] is False


def test_dashboard_reports_setup_state(client):
    token = register(client)["access_token"]
    dash = client.get("/api/v1/customers/me/dashboard", headers=auth_header(token)).json()
    assert dash["shipping_available"] is False
    assert dash["shipments"]["total"] == 0
    assert dash["setup"] == {
        "email_verified": False,
        "has_addresses": False,
        "has_default_sender": False,
        "mfa_enabled": False,
    }


def test_address_crud_normalizes_and_verifies(client):
    token = register(client)["access_token"]
    created = client.post("/api/v1/customers/addresses", json=ADDRESS, headers=auth_header(token))
    assert created.status_code == 201, created.text
    address = created.json()
    assert address["postal_code"] == "M5H 2N2" and address["region"] == "ON"
    assert address["verified"] is True
    listing = client.get("/api/v1/customers/addresses?q=office", headers=auth_header(token)).json()
    assert listing["total"] == 1

    updated = client.patch(
        f"/api/v1/customers/addresses/{address['id']}",
        json={**ADDRESS, "street1": "no number street"},
        headers=auth_header(token),
    )
    assert updated.status_code == 200 and updated.json()["verified"] is False
    assert client.delete(f"/api/v1/customers/addresses/{address['id']}", headers=auth_header(token)).status_code == 204
    assert client.get(f"/api/v1/customers/addresses/{address['id']}", headers=auth_header(token)).status_code == 404


def test_address_validation(client):
    token = register(client)["access_token"]
    bad_postal = client.post(
        "/api/v1/customers/addresses", json={**ADDRESS, "postal_code": "12345"}, headers=auth_header(token)
    )
    assert bad_postal.status_code == 422
    bad_region = client.post(
        "/api/v1/customers/addresses", json={**ADDRESS, "region": "NY"}, headers=auth_header(token)
    )
    assert bad_region.status_code == 422
    no_name = client.post("/api/v1/customers/addresses", json={**ADDRESS, "name": None}, headers=auth_header(token))
    assert no_name.status_code == 422
    us = client.post(
        "/api/v1/customers/addresses",
        json={**ADDRESS, "country": "US", "region": "NY", "postal_code": "10001-1234", "city": "New York"},
        headers=auth_header(token),
    )
    assert us.status_code == 201


def test_only_one_default_sender(client):
    token = register(client)["access_token"]
    a = client.post(
        "/api/v1/customers/addresses", json={**ADDRESS, "is_default_sender": True}, headers=auth_header(token)
    )
    b = client.post(
        "/api/v1/customers/addresses",
        json={**ADDRESS, "nickname": "Home", "is_default_sender": True},
        headers=auth_header(token),
    )
    assert a.status_code == b.status_code == 201
    items = client.get("/api/v1/customers/addresses", headers=auth_header(token)).json()["items"]
    defaults = [i for i in items if i["is_default_sender"]]
    assert len(defaults) == 1 and defaults[0]["id"] == b.json()["id"]


def test_cross_account_access_is_denied(client):
    alice = register(client)["access_token"]
    bob = register(client, email="bob@example.com")["access_token"]
    address_id = client.post("/api/v1/customers/addresses", json=ADDRESS, headers=auth_header(alice)).json()["id"]
    assert client.get(f"/api/v1/customers/addresses/{address_id}", headers=auth_header(bob)).status_code == 404
    assert (
        client.patch(f"/api/v1/customers/addresses/{address_id}", json=ADDRESS, headers=auth_header(bob)).status_code
        == 404
    )
    assert client.delete(f"/api/v1/customers/addresses/{address_id}", headers=auth_header(bob)).status_code == 404
    assert client.get("/api/v1/customers/addresses", headers=auth_header(bob)).json()["total"] == 0
    assert client.get(f"/api/v1/customers/addresses/{address_id}", headers=auth_header(alice)).status_code == 200


def test_verify_endpoint_returns_simulated_suggestion(client):
    token = register(client)["access_token"]
    body = client.post(
        "/api/v1/addresses/verify",
        json={k: ADDRESS[k] for k in ("street1", "city", "region", "postal_code", "country")},
        headers=auth_header(token),
    ).json()
    assert body["is_valid"] is True and body["simulated"] is True
    assert body["suggestion"]["street1"] == "100 Queen St W"
    mismatch = client.post(
        "/api/v1/addresses/verify",
        json={"street1": "1 Main St", "city": "Calgary", "region": "AB", "postal_code": "M5H 2N2", "country": "CA"},
        headers=auth_header(token),
    ).json()
    assert mismatch["is_valid"] is False and "address.postal_region_mismatch" in mismatch["messages"]


def test_notification_preferences(client):
    token = register(client)["access_token"]
    prefs = client.get("/api/v1/customers/me/notification-preferences", headers=auth_header(token)).json()[
        "preferences"
    ]
    assert prefs["tracking_delivered"] is True and prefs["marketing"] is False
    updated = client.put(
        "/api/v1/customers/me/notification-preferences",
        json={"preferences": {"marketing": True, "unknown_event": True}},
        headers=auth_header(token),
    ).json()["preferences"]
    assert updated["marketing"] is True and "unknown_event" not in updated


def test_close_account_anonymizes(client):
    token = register(client)["access_token"]
    client.post("/api/v1/customers/addresses", json=ADDRESS, headers=auth_header(token))
    wrong = client.request(
        "DELETE", "/api/v1/customers/me", json={"password": "nope", "confirm": "CLOSE"}, headers=auth_header(token)
    )
    assert wrong.status_code == 400
    ok = client.request(
        "DELETE", "/api/v1/customers/me", json={"password": PASSWORD, "confirm": "CLOSE"}, headers=auth_header(token)
    )
    assert ok.status_code == 204
    assert client.get("/api/v1/customers/me", headers=auth_header(token)).status_code == 401
    assert (
        client.post("/api/v1/auth/login", json={"email": "alice@example.com", "password": PASSWORD}).status_code == 401
    )
    # The address can be registered again because the old account no longer holds it.
    register(client)
