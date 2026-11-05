"""Staff roles and permissions (docs/02-technical-spec.md §2). Seeded idempotently."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.identity.models import Permission, Role

PERMISSIONS: dict[str, str] = {
    "admin.dashboard.view": "View the admin dashboard",
    "customers.view": "View customer accounts",
    "customers.suspend": "Suspend and reactivate customer accounts",
    "shipments.view_all": "View all shipments (Phase 2)",
    "shipments.void_any": "Void any shipment (Phase 2)",
    "payments.view": "View payments (Phase 2)",
    "payments.refund": "Issue refunds (Phase 2)",
    "pricing.manage": "Manage markup rules (Phase 2)",
    "carriers.manage": "Enable carriers and services (Phase 2)",
    "reports.view": "View reports",
    "audit.view": "View the audit log",
    "staff.manage": "Manage staff accounts and roles",
    "settings.manage": "Change platform settings",
}

ROLES: dict[str, tuple[str, set[str]]] = {
    "super_admin": ("Super administrator", set(PERMISSIONS)),
    "operations_admin": (
        "Operations administrator",
        {
            "admin.dashboard.view", "customers.view", "customers.suspend", "shipments.view_all",
            "shipments.void_any", "payments.view", "payments.refund", "reports.view",
        },
    ),
    "support": (
        "Customer support",
        {"admin.dashboard.view", "customers.view", "shipments.view_all", "shipments.void_any", "payments.view"},
    ),
}  # fmt: skip


def seed_rbac(db: Session) -> None:
    perms = {p.code: p for p in db.scalars(select(Permission))}
    for code, description in PERMISSIONS.items():
        if code not in perms:
            perms[code] = Permission(code=code, description=description)
            db.add(perms[code])
        else:
            perms[code].description = description
    db.flush()
    roles = {r.code: r for r in db.scalars(select(Role))}
    for code, (name, granted) in ROLES.items():
        role = roles.get(code) or Role(code=code, name=name)
        role.name = name
        role.permissions = [perms[c] for c in sorted(granted)]
        db.add(role)
    db.flush()
