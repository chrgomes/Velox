"""Offline, deterministic mock provider for development and tests.

Prices and delivery times here are SIMULATED. They are not carrier quotes and are always
returned with ``source="mock"`` so the API and UI can label them as such.
"""

import hashlib
import math
from dataclasses import replace
from datetime import date, timedelta

from app.integrations.shipping_providers.base import (
    AddressInput,
    AddressVerification,
    ProviderRate,
    QuoteRequest,
)
from app.modules.reference.data import (
    normalize_postal,
    postal_is_valid,
    postal_matches_region,
    region_is_valid,
)

CARRIER_NAMES = {
    "usps": "USPS",
    "ups": "UPS",
    "fedex": "FedEx",
    "canada_post": "Canada Post",
    "purolator": "Purolator",
    "canpar": "Canpar",
}

# (carrier, service code, service name, base cents, cents per billable lb, min days, max days, guaranteed)
SERVICES: dict[str, list[tuple[str, str, str, int, int, int, int, bool]]] = {
    "US-US": [
        ("usps", "ground_advantage", "Ground Advantage", 545, 62, 2, 5, False),
        ("usps", "priority", "Priority Mail", 895, 95, 1, 3, False),
        ("ups", "ground", "UPS Ground", 1050, 88, 1, 5, False),
        ("fedex", "home_delivery", "FedEx Home Delivery", 1095, 85, 1, 5, False),
        ("ups", "next_day_air", "UPS Next Day Air", 3150, 310, 1, 1, True),
    ],
    "CA-CA": [
        ("canada_post", "regular_parcel", "Regular Parcel", 1095, 120, 2, 7, False),
        ("canada_post", "expedited_parcel", "Expedited Parcel", 1295, 135, 1, 5, False),
        ("canada_post", "xpresspost", "Xpresspost", 1795, 190, 1, 3, True),
        ("purolator", "ground", "Purolator Ground", 1395, 125, 1, 6, False),
        ("purolator", "express", "Purolator Express", 2395, 240, 1, 2, True),
        ("canpar", "ground", "Canpar Ground", 1195, 110, 1, 6, False),
    ],
    "CA-US": [
        ("canada_post", "tracked_packet_usa", "Tracked Packet – USA", 1495, 210, 4, 8, False),
        ("canada_post", "expedited_usa", "Expedited Parcel – USA", 2195, 260, 4, 7, False),
        ("ups", "standard_us", "UPS Standard to US", 2495, 240, 3, 6, False),
        ("purolator", "ground_us", "Purolator Ground U.S.", 2295, 230, 3, 7, False),
    ],
    "US-CA": [
        ("usps", "priority_intl", "Priority Mail International", 3295, 280, 6, 10, False),
        ("usps", "first_class_intl", "First-Class Package International", 1695, 330, 7, 21, False),
        ("ups", "standard_ca", "UPS Standard to Canada", 2295, 230, 3, 6, False),
        ("fedex", "intl_ground", "FedEx International Ground", 2195, 220, 3, 7, False),
    ],
}

_CA_ZONES = "ABCEGHJKLMNPRSTVXY"


def _zone(request: QuoteRequest) -> int:
    """0-8 distance band from postal prefixes. Cross-border lanes use a fixed band."""
    if request.from_country != request.to_country:
        return 5
    a, b = request.from_postal.strip().upper()[:1], request.to_postal.strip().upper()[:1]
    if request.from_country == "US":
        return min(8, abs(int(a) - int(b))) if a.isdigit() and b.isdigit() else 4
    ia, ib = _CA_ZONES.find(a), _CA_ZONES.find(b)
    return min(8, abs(ia - ib) // 2) if ia >= 0 and ib >= 0 else 4


def _add_business_days(start: date, days: int) -> date:
    current = start
    while days > 0:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days -= 1
    return current


class MockShippingProvider:
    code = "mock"

    def verify_address(self, address: AddressInput) -> AddressVerification:
        messages: list[str] = []
        country = address.country
        if not region_is_valid(country, address.region):
            messages.append("address.region_invalid")
        if not postal_is_valid(country, address.postal_code):
            messages.append("address.postal_invalid")
        elif not postal_matches_region(country, address.postal_code, address.region):
            messages.append("address.postal_region_mismatch")
        if not address.street1.strip() or not any(ch.isdigit() for ch in address.street1):
            messages.append("address.street_number_missing")
        if messages:
            return AddressVerification(is_valid=False, source=self.code, normalized=None, messages=messages)
        normalized = replace(
            address,
            street1=" ".join(address.street1.split()).title(),
            street2=" ".join(address.street2.split()).title() if address.street2 else None,
            city=" ".join(address.city.split()).title(),
            postal_code=normalize_postal(country, address.postal_code),
        )
        return AddressVerification(
            is_valid=True,
            source=self.code,
            normalized=normalized,
            messages=["address.verified_simulated"],
            verification_ref="mock_adr_"
            + hashlib.sha256(f"{normalized.street1}|{normalized.postal_code}".encode()).hexdigest()[:12],
        )

    def get_rates(self, request: QuoteRequest) -> list[ProviderRate]:
        lane = f"{request.from_country}-{request.to_country}"
        services = SERVICES.get(lane, [])
        p = request.parcel
        dim_weight_lb = (p.length_in * p.width_in * p.height_in) / 139
        billable_lb = max(1, math.ceil(max(p.weight_oz / 16, dim_weight_lb)))
        zone = _zone(request)
        currency = "USD" if request.from_country == "US" else "CAD"
        today = date.today()
        rates = []
        for carrier, code, name, base, per_lb, dmin, dmax, guaranteed in services:
            amount = int(round(base + per_lb * billable_lb * (1 + 0.09 * zone)))
            extra = zone // 3 if not guaranteed else 0
            lo, hi = dmin + extra, dmax + extra
            rates.append(
                ProviderRate(
                    carrier=carrier,
                    carrier_name=CARRIER_NAMES[carrier],
                    service_code=code,
                    service_name=name,
                    amount=amount,
                    currency=currency,
                    delivery_days_min=lo,
                    delivery_days_max=hi,
                    estimated_delivery_date=_add_business_days(today, hi),
                    guaranteed=guaranteed,
                    tracking_included=True,
                    source="mock",
                )
            )
        return sorted(rates, key=lambda r: r.amount)
