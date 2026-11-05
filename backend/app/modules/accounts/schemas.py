import re
import uuid
from datetime import datetime
from typing import Literal
from zoneinfo import available_timezones

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.modules.identity.schemas import Locale, MeOut
from app.modules.reference.data import normalize_postal, postal_is_valid, region_is_valid

_PHONE = re.compile(r"^\+?[0-9 ()\-.]{7,20}$")
_TIMEZONES = available_timezones()


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    value = " ".join(value.split())
    return value or None


class AccountSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    name: str
    country: str
    default_currency: str
    status: str


class CustomerOut(MeOut):
    account: AccountSummary | None


class ProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=100)
    last_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = Field(default=None, max_length=32)
    locale: Locale | None = None
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("first_name", "last_name")
    @classmethod
    def _names(cls, v: str | None) -> str | None:
        v = _clean(v)
        if v is None:
            raise ValueError("must not be blank")
        return v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        v = _clean(v)
        if v is not None and not _PHONE.match(v):
            raise ValueError("invalid phone number")
        return v

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str | None) -> str | None:
        if v is not None and v not in _TIMEZONES:
            raise ValueError("unknown time zone")
        return v


class CloseAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str | None = Field(default=None, max_length=20)
    confirm: Literal["CLOSE"]


class AddressIn(BaseModel):
    nickname: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, max_length=200)
    company: str | None = Field(default=None, max_length=200)
    street1: str = Field(min_length=1, max_length=200)
    street2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=2, max_length=3)
    postal_code: str = Field(min_length=3, max_length=10)
    country: Literal["US", "CA"]
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    is_residential: bool = True
    is_default_sender: bool = False

    @field_validator("nickname", "name", "company", "street1", "street2", "city", mode="before")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return _clean(v) if isinstance(v, str) else v

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        v = _clean(v)
        if v is not None and not _PHONE.match(v):
            raise ValueError("invalid phone number")
        return v

    @model_validator(mode="after")
    def _check(self) -> "AddressIn":
        self.region = self.region.strip().upper()
        if not (self.name or self.company):
            raise ValueError("name or company is required")
        if not region_is_valid(self.country, self.region):
            raise ValueError("region is not valid for this country")
        if not postal_is_valid(self.country, self.postal_code):
            raise ValueError("postal code is not valid for this country")
        self.postal_code = normalize_postal(self.country, self.postal_code)
        return self


class AddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    nickname: str | None
    name: str | None
    company: str | None
    street1: str
    street2: str | None
    city: str
    region: str
    postal_code: str
    country: str
    phone: str | None
    email: str | None
    is_residential: bool
    is_default_sender: bool
    verified: bool
    created_at: datetime
    updated_at: datetime


class AddressVerifyIn(BaseModel):
    street1: str = Field(min_length=1, max_length=200)
    street2: str | None = Field(default=None, max_length=200)
    city: str = Field(min_length=1, max_length=100)
    region: str = Field(min_length=2, max_length=3)
    postal_code: str = Field(min_length=3, max_length=10)
    country: Literal["US", "CA"]


class AddressVerifyOut(BaseModel):
    is_valid: bool
    source: str
    simulated: bool
    messages: list[str]
    suggestion: AddressVerifyIn | None


class NotificationPreferences(BaseModel):
    preferences: dict[str, bool]
