import json

import pytest

from app.core.config import Settings
from app.core.i18n import LOCALES_DIR, negotiate, t
from app.modules.notifications.service import TEMPLATES, render, send_pending
from tests.conftest import last_email, register

QUOTE = {
    "from_country": "CA",
    "from_postal": "M5H 2N2",
    "to_country": "CA",
    "to_postal": "V6B 1A1",
    "weight": 1.5,
    "weight_unit": "kg",
    "length": 30,
    "width": 20,
    "height": 10,
    "dimension_unit": "cm",
}


def test_health_and_ready(client):
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/ready").json()["status"] == "ready"
    assert client.get("/api/v1/health").headers["X-Content-Type-Options"] == "nosniff"
    # Monitoring tools (and wait-on in CI) probe with HEAD.
    assert client.head("/api/v1/health").status_code == 200
    assert client.head("/api/v1/ready").status_code == 200


def test_errors_use_envelope(client):
    body = client.get("/api/v1/does-not-exist").json()
    assert body["error"]["code"] == "not_found" and body["error"]["request_id"]
    invalid = client.post("/api/v1/quotes", json={}).json()
    assert invalid["error"]["code"] == "validation_error" and invalid["error"]["details"]["fields"]


def test_quotes_are_simulated_and_sorted(client):
    body = client.post("/api/v1/quotes", json=QUOTE).json()
    assert body["simulated"] is True and body["is_estimate"] is True
    prices = [r["price"]["amount"] for r in body["rates"]]
    assert prices == sorted(prices) and all(r["price"]["currency"] == "CAD" for r in body["rates"])
    assert {r["carrier"] for r in body["rates"]} >= {"canada_post", "purolator"}
    cross = client.post("/api/v1/quotes", json={**QUOTE, "to_country": "US", "to_postal": "10001"}).json()
    assert all(r["source"] == "mock" for r in cross["rates"]) and cross["rates"]


def test_quote_validation(client):
    assert client.post("/api/v1/quotes", json={**QUOTE, "to_postal": "10001"}).status_code == 422
    assert client.post("/api/v1/quotes", json={**QUOTE, "weight": 80, "weight_unit": "kg"}).status_code == 422
    assert client.post("/api/v1/quotes", json={**QUOTE, "length": 300}).status_code == 422


def test_reference_countries(client):
    countries = {c["code"]: c for c in client.get("/api/v1/reference/countries").json()}
    assert set(countries) == {"US", "CA"}
    assert len(countries["CA"]["regions"]) == 13 and countries["US"]["currency"] == "USD"


def test_translation_catalogs_have_identical_keys():
    catalogs = {p.stem: set(json.loads(p.read_text(encoding="utf-8"))) for p in LOCALES_DIR.glob("*.json")}
    assert set(catalogs) == {"en", "fr-CA", "es-419"}
    assert catalogs["en"] == catalogs["fr-CA"] == catalogs["es-419"]
    for template, spec in TEMPLATES.items():
        for part in (*spec.paragraphs, "subject", *([spec.action_key] if spec.action_key else [])):
            assert f"email.{template}.{part}" in catalogs["en"]


def test_locale_negotiation_and_rendering():
    assert negotiate("fr-FR,fr;q=0.9,en;q=0.8") == "fr-CA"
    assert negotiate("de-DE,es;q=0.5") == "es-419"
    assert negotiate(None) == "en"
    subject, text, html = render("verify_email", "fr-CA", "Zoé <b>", "https://example.com/v?token=abc")
    assert subject.startswith("Confirmez")
    assert "Zoé &lt;b&gt;" in html and "<b>" not in html.split("<body")[1].split("Zoé")[1][:5]
    assert "https://example.com/v?token=abc" in text
    assert t("email.greeting", "es-419", name="Ana") == "Hola, Ana:"


def test_registration_email_uses_user_locale(client):
    register(client, locale="es-419")
    assert last_email("alice@example.com", "verify_email").subject.startswith("Confirma tu correo")


def test_outbox_sends_and_retries(client):
    register(client)

    class Failing:
        code = "test"

        def send(self, message):
            raise RuntimeError("smtp down")

    assert send_pending(provider=Failing()) == 0
    message = last_email("alice@example.com", "verify_email")
    assert message.status == "queued" and message.attempts == 1 and "smtp down" in message.last_error

    class Recording:
        code = "test"
        sent = []

        def send(self, message):
            self.sent.append(message)
            return "msg-1"

    provider = Recording()
    assert send_pending(provider=provider) == 1
    message = last_email("alice@example.com", "verify_email")
    assert message.status == "sent" and message.body_text == "[removed after delivery]"
    assert "token=" in provider.sent[0].text


def test_production_settings_guard():
    with pytest.raises(ValueError, match="shipping_provider=mock"):
        Settings(app_mode="production")
