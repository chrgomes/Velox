"""Imports every model so SQLAlchemy metadata (and Alembic autogenerate) sees all tables."""

from app.core.rate_limit import RateLimitCounter
from app.modules.accounts.models import Account, AccountMember, Address
from app.modules.admin.models import SystemSetting
from app.modules.audit.models import AuditLog
from app.modules.identity.models import MfaRecoveryCode, OneTimeToken, Permission, RefreshToken, Role, User
from app.modules.notifications.models import EmailMessage, NotificationPreference

__all__ = [
    "Account",
    "AccountMember",
    "Address",
    "AuditLog",
    "EmailMessage",
    "MfaRecoveryCode",
    "NotificationPreference",
    "OneTimeToken",
    "Permission",
    "RateLimitCounter",
    "RefreshToken",
    "Role",
    "SystemSetting",
    "User",
]
