"""Shipping provider interface (see docs/01-architecture.md §3).

Phase 1 uses only address verification and quote estimates. Label purchase, void and tracking
are added to this interface in Phase 2.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Literal, Protocol


@dataclass
class AddressInput:
    street1: str
    city: str
    region: str
    postal_code: str
    country: str
    street2: str | None = None
    name: str | None = None
    company: str | None = None


@dataclass
class AddressVerification:
    is_valid: bool
    source: str
    normalized: AddressInput | None
    messages: list[str] = field(default_factory=list)  # message codes, translated by the frontend
    verification_ref: str | None = None


@dataclass
class QuoteParcel:
    weight_oz: float
    length_in: float
    width_in: float
    height_in: float


@dataclass
class QuoteRequest:
    from_country: str
    from_postal: str
    to_country: str
    to_postal: str
    parcel: QuoteParcel


@dataclass
class ProviderRate:
    carrier: str
    carrier_name: str
    service_code: str
    service_name: str
    amount: int  # minor units
    currency: str
    delivery_days_min: int
    delivery_days_max: int
    estimated_delivery_date: date | None
    guaranteed: bool
    tracking_included: bool
    source: Literal["mock", "easypost"]


class ShippingProvider(Protocol):
    code: str

    def verify_address(self, address: AddressInput) -> AddressVerification: ...

    def get_rates(self, request: QuoteRequest) -> list[ProviderRate]: ...


def get_shipping_provider() -> ShippingProvider:
    from app.core.config import get_settings

    settings = get_settings()
    if settings.shipping_provider == "easypost":
        raise NotImplementedError("The EasyPost adapter is built in Phase 2.")
    from app.integrations.shipping_providers.mock import MockShippingProvider

    return MockShippingProvider()
