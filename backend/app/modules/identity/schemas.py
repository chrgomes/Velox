import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Locale = Literal["en", "fr-CA", "es-419"]
Country = Literal["US", "CA"]

PASSWORD_MIN = 10
PASSWORD_MAX = 128


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    country: Country
    locale: Locale = "en"
    accept_terms: bool

    @field_validator("first_name", "last_name")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value

    @field_validator("accept_terms")
    @classmethod
    def _terms(cls, value: bool) -> bool:
        if not value:
            raise ValueError("terms must be accepted")
        return value


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)


class MfaLoginIn(BaseModel):
    mfa_token: str = Field(min_length=10, max_length=200)
    code: str = Field(min_length=6, max_length=20)


class EmailIn(BaseModel):
    email: EmailStr


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=PASSWORD_MAX)
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=PASSWORD_MAX)


class MfaCodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)


class MfaDisableIn(BaseModel):
    password: str = Field(min_length=1, max_length=PASSWORD_MAX)
    code: str = Field(min_length=6, max_length=20)


class MeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    first_name: str
    last_name: str
    phone: str | None
    locale: str
    country: str
    timezone: str
    email_verified: bool
    mfa_enabled: bool
    is_staff: bool
    roles: list[str]
    permissions: list[str]
    mfa_setup_required: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    user: MeOut


class MfaChallengeOut(BaseModel):
    mfa_required: Literal[True] = True
    mfa_token: str


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str


class RecoveryCodesOut(BaseModel):
    recovery_codes: list[str]


class SessionOut(BaseModel):
    id: uuid.UUID
    started_at: datetime
    last_used_at: datetime
    expires_at: datetime
    ip: str | None
    user_agent: str | None
    current: bool
