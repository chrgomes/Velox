"""Public rate calculator (estimates only; not purchasable).

Phase 1: rates come from the mock provider and are marked ``simulated``. Phase 2 swaps in
EasyPost and applies markup rules; the response shape stays the same.
"""

from datetime import date
from typing import Literal

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, model_validator

from app.core.rate_limit import client_ip, hit
from app.integrations.shipping_providers.base import QuoteParcel, QuoteRequest, get_shipping_provider
from app.modules.reference.data import normalize_postal, postal_is_valid

router = APIRouter(prefix="/quotes", tags=["quotes"])

_TO_OZ = {"oz": 1.0, "lb": 16.0, "g": 0.035274, "kg": 35.274}
_TO_IN = {"in": 1.0, "cm": 0.393701}
MAX_WEIGHT_OZ = 150 * 16
MAX_SIDE_IN = 108


class QuoteIn(BaseModel):
    from_country: Literal["US", "CA"]
    from_postal: str = Field(min_length=3, max_length=10)
    to_country: Literal["US", "CA"]
    to_postal: str = Field(min_length=3, max_length=10)
    weight: float = Field(gt=0, le=1000)
    weight_unit: Literal["oz", "lb", "g", "kg"]
    length: float = Field(gt=0, le=300)
    width: float = Field(gt=0, le=300)
    height: float = Field(gt=0, le=300)
    dimension_unit: Literal["in", "cm"]

    @model_validator(mode="after")
    def _check(self) -> "QuoteIn":
        if not postal_is_valid(self.from_country, self.from_postal):
            raise ValueError("from_postal is not valid for from_country")
        if not postal_is_valid(self.to_country, self.to_postal):
            raise ValueError("to_postal is not valid for to_country")
        if self.weight * _TO_OZ[self.weight_unit] > MAX_WEIGHT_OZ:
            raise ValueError("weight exceeds 150 lb (68 kg)")
        if max(self.length, self.width, self.height) * _TO_IN[self.dimension_unit] > MAX_SIDE_IN:
            raise ValueError("a side exceeds 108 in (274 cm)")
        return self


class Money(BaseModel):
    amount: int
    currency: str


class QuoteRateOut(BaseModel):
    carrier: str
    carrier_name: str
    service_code: str
    service_name: str
    price: Money
    delivery_days_min: int
    delivery_days_max: int
    estimated_delivery_date: date | None
    guaranteed: bool
    tracking_included: bool
    source: str


class QuoteOut(BaseModel):
    is_estimate: bool = True
    simulated: bool
    rates: list[QuoteRateOut]


@router.post("", response_model=QuoteOut)
def quote(data: QuoteIn, request: Request) -> QuoteOut:
    hit("quote_ip", client_ip(request))
    unit_in = _TO_IN[data.dimension_unit]
    req = QuoteRequest(
        from_country=data.from_country,
        from_postal=normalize_postal(data.from_country, data.from_postal),
        to_country=data.to_country,
        to_postal=normalize_postal(data.to_country, data.to_postal),
        parcel=QuoteParcel(
            weight_oz=data.weight * _TO_OZ[data.weight_unit],
            length_in=data.length * unit_in,
            width_in=data.width * unit_in,
            height_in=data.height * unit_in,
        ),
    )
    rates = get_shipping_provider().get_rates(req)
    return QuoteOut(
        simulated=any(r.source == "mock" for r in rates),
        rates=[
            QuoteRateOut(
                carrier=r.carrier,
                carrier_name=r.carrier_name,
                service_code=r.service_code,
                service_name=r.service_name,
                price=Money(amount=r.amount, currency=r.currency),
                delivery_days_min=r.delivery_days_min,
                delivery_days_max=r.delivery_days_max,
                estimated_delivery_date=r.estimated_delivery_date,
                guaranteed=r.guaranteed,
                tracking_included=r.tracking_included,
                source=r.source,
            )
            for r in rates
        ],
    )
