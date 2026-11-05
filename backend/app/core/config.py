"""Application settings, loaded from environment variables (prefix ``VELOX_``) or ``.env``."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_LOCALES = ("en", "fr-CA", "es-419")
SUPPORTED_COUNTRIES = ("US", "CA")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="VELOX_", extra="ignore")

    app_mode: Literal["development", "sandbox", "production"] = "development"
    app_name: str = "Velox"
    public_web_url: str = "http://localhost:4200"

    database_url: str = "postgresql+psycopg://velox:velox@localhost:5432/velox"

    # Security
    jwt_secret: str = Field(default="dev-only-insecure-jwt-secret-change-me", min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    refresh_token_absolute_days: int = 90
    # Fernet key (urlsafe base64, 32 bytes) used to encrypt MFA secrets at rest.
    encryption_key: str = "ZGV2LW9ubHktZW5jcnlwdGlvbi1rZXktMzJieXRlcyE="
    cookie_secure: bool = False
    cors_origins: list[str] = ["http://localhost:4200"]
    login_max_failures: int = 5
    login_lockout_minutes: int = 15
    verify_email_token_hours: int = 24
    reset_password_token_hours: int = 1
    mfa_login_token_minutes: int = 5
    require_staff_mfa: bool = True
    staff_invite_token_hours: int = 72
    # Check new passwords against the Have I Been Pwned k-anonymity API (fails open on network errors).
    password_breach_check: bool = False

    # Integrations
    shipping_provider: Literal["mock", "easypost"] = "mock"
    email_provider: Literal["console", "postmark"] = "console"
    email_from: str = "Velox <no-reply@localhost>"
    postmark_server_token: str = ""

    @model_validator(mode="after")
    def _production_guard(self) -> "Settings":
        if self.app_mode == "production":
            problems = []
            if self.shipping_provider == "mock":
                problems.append("shipping_provider=mock is not allowed in production")
            if self.email_provider == "console":
                problems.append("email_provider=console is not allowed in production")
            if self.jwt_secret.startswith("dev-only"):
                problems.append("jwt_secret must be set in production")
            if self.encryption_key == Settings.model_fields["encryption_key"].default:
                problems.append("encryption_key must be set in production")
            if not self.cookie_secure:
                problems.append("cookie_secure must be true in production")
            if problems:
                raise ValueError("; ".join(problems))
        return self

    @property
    def is_development(self) -> bool:
        return self.app_mode == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
