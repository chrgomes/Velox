import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from app.core.deps import DB, require_permission
from app.core.pagination import Pagination
from app.modules.admin import service
from app.modules.identity.models import User

router = APIRouter(prefix="/admin", tags=["admin"])


def staff(permission: str) -> Any:
    return Annotated[User, Depends(require_permission(permission))]


class StatusChangeIn(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class StaffCreateIn(BaseModel):
    email: EmailStr
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    roles: list[str] = Field(min_length=1, max_length=5)
    locale: Literal["en", "fr-CA", "es-419"] = "en"
    country: Literal["US", "CA"] = "CA"


class StaffUpdateIn(BaseModel):
    roles: list[str] | None = Field(default=None, min_length=1, max_length=5)
    status: Literal["active", "suspended"] | None = None


@router.get("/dashboard")
def dashboard(db: DB, _: staff("admin.dashboard.view")) -> dict:
    return service.dashboard(db)


@router.get("/customers")
def customers(
    db: DB,
    _: staff("customers.view"),
    page: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[Literal["active", "suspended", "deleted"] | None, Query(alias="status")] = None,
) -> dict:
    items, total = service.list_customers(db, q, status_filter, page)
    return {"items": items, "page": page.page, "page_size": page.page_size, "total": total}


@router.get("/customers/{user_id}")
def customer(user_id: uuid.UUID, db: DB, viewer: staff("customers.view")) -> dict:
    return service.customer_detail(db, user_id, viewer)


@router.post("/customers/{user_id}/suspend")
def suspend(
    user_id: uuid.UUID, data: StatusChangeIn, request: Request, db: DB, actor: staff("customers.suspend")
) -> dict:
    return service.set_customer_status(db, actor, user_id, True, data.reason, request)


@router.post("/customers/{user_id}/reactivate")
def reactivate(
    user_id: uuid.UUID, data: StatusChangeIn, request: Request, db: DB, actor: staff("customers.suspend")
) -> dict:
    return service.set_customer_status(db, actor, user_id, False, data.reason, request)


@router.get("/staff")
def list_staff(db: DB, _: staff("staff.manage")) -> list[dict]:
    return service.list_staff(db)


@router.post("/staff", status_code=status.HTTP_201_CREATED)
def create_staff(data: StaffCreateIn, request: Request, db: DB, actor: staff("staff.manage")) -> dict:
    return service.create_staff(db, actor, data.model_dump(), request)


@router.patch("/staff/{user_id}")
def update_staff(
    user_id: uuid.UUID, data: StaffUpdateIn, request: Request, db: DB, actor: staff("staff.manage")
) -> dict:
    return service.update_staff(db, actor, user_id, data.model_dump(exclude_unset=True), request)


@router.post("/staff/{user_id}/resend-invite", status_code=status.HTTP_204_NO_CONTENT)
def resend_invite(user_id: uuid.UUID, request: Request, db: DB, actor: staff("staff.manage")) -> Response:
    service.resend_invite(db, actor, user_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/roles")
def roles(db: DB, _: staff("staff.manage")) -> list[dict]:
    return service.list_roles(db)


@router.get("/audit-logs")
def audit_logs(
    db: DB,
    _: staff("audit.view"),
    page: Pagination,
    action: Annotated[str | None, Query(max_length=100)] = None,
    actor_user_id: uuid.UUID | None = None,
    entity_type: Annotated[str | None, Query(max_length=50)] = None,
    entity_id: Annotated[str | None, Query(max_length=64)] = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
) -> dict:
    items, total = service.list_audit(db, page, action, actor_user_id, entity_type, entity_id, date_from, date_to)
    return {"items": items, "page": page.page, "page_size": page.page_size, "total": total}


@router.get("/settings")
def get_settings(db: DB, _: staff("settings.manage")) -> dict:
    return service.all_settings(db)


@router.patch("/settings")
def patch_settings(values: dict[str, Any], request: Request, db: DB, actor: staff("settings.manage")) -> dict:
    return service.update_settings(db, actor, values, request)
