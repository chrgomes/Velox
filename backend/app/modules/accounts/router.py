import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status

from app.core.deps import DB, CurrentAccount, CurrentUser
from app.core.pagination import Page, Pagination
from app.core.rate_limit import client_ip, hit
from app.integrations.shipping_providers.base import AddressInput, get_shipping_provider
from app.modules.accounts import service
from app.modules.accounts.schemas import (
    AddressIn,
    AddressOut,
    AddressVerifyIn,
    AddressVerifyOut,
    CloseAccountIn,
    CustomerOut,
    NotificationPreferences,
    ProfileUpdate,
)
from app.modules.notifications import service as notifications
from app.modules.reference.data import region_is_valid

router = APIRouter(tags=["customers"])


@router.get("/customers/me", response_model=CustomerOut)
def get_me(db: DB, user: CurrentUser) -> CustomerOut:
    return service.customer_out(db, user)


@router.patch("/customers/me", response_model=CustomerOut)
def update_me(data: ProfileUpdate, request: Request, db: DB, user: CurrentUser) -> CustomerOut:
    return service.update_profile(db, user, data, request)


@router.delete("/customers/me", status_code=status.HTTP_204_NO_CONTENT)
def close_me(data: CloseAccountIn, request: Request, db: DB, user: CurrentUser) -> Response:
    service.close_account(db, user, service.account_for_user(db, user), data.password, data.code, request)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie("velox_refresh", path="/api/v1/auth")
    return response


@router.get("/customers/me/dashboard")
def get_dashboard(db: DB, user: CurrentUser, account: CurrentAccount) -> dict:
    return service.dashboard(db, user, account)


@router.get("/customers/me/notification-preferences", response_model=NotificationPreferences)
def get_preferences(db: DB, user: CurrentUser) -> NotificationPreferences:
    return NotificationPreferences(preferences=notifications.get_preferences(db, user))


@router.put("/customers/me/notification-preferences", response_model=NotificationPreferences)
def put_preferences(data: NotificationPreferences, db: DB, user: CurrentUser) -> NotificationPreferences:
    prefs = notifications.set_preferences(db, user, data.preferences)
    db.commit()
    return NotificationPreferences(preferences=prefs)


@router.get("/customers/addresses", response_model=Page[AddressOut])
def list_addresses(
    db: DB, account: CurrentAccount, page: Pagination, q: Annotated[str | None, Query(max_length=100)] = None
) -> Page[AddressOut]:
    rows, total = service.list_addresses(db, account, q, page)
    return Page(items=[service.address_out(a) for a in rows], page=page.page, page_size=page.page_size, total=total)


@router.post("/customers/addresses", response_model=AddressOut, status_code=status.HTTP_201_CREATED)
def create_address(data: AddressIn, request: Request, db: DB, user: CurrentUser, account: CurrentAccount) -> AddressOut:
    return service.address_out(service.create_address(db, user, account, data, request))


@router.get("/customers/addresses/{address_id}", response_model=AddressOut)
def get_address(address_id: uuid.UUID, db: DB, account: CurrentAccount) -> AddressOut:
    return service.address_out(service._get_address(db, account, address_id))


@router.patch("/customers/addresses/{address_id}", response_model=AddressOut)
def update_address(
    address_id: uuid.UUID, data: AddressIn, request: Request, db: DB, user: CurrentUser, account: CurrentAccount
) -> AddressOut:
    return service.address_out(service.update_address(db, user, account, address_id, data, request))


@router.delete("/customers/addresses/{address_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_address(
    address_id: uuid.UUID, request: Request, db: DB, user: CurrentUser, account: CurrentAccount
) -> Response:
    service.delete_address(db, user, account, address_id, request)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/addresses/verify", response_model=AddressVerifyOut)
def verify_address(data: AddressVerifyIn, request: Request, user: CurrentUser) -> AddressVerifyOut:
    hit("verify_address", f"{user.id}|{client_ip(request)}")
    region = data.region.strip().upper()
    if not region_is_valid(data.country, region):
        return AddressVerifyOut(
            is_valid=False, source="validation", simulated=False, messages=["address.region_invalid"], suggestion=None
        )
    provider = get_shipping_provider()
    result = provider.verify_address(
        AddressInput(
            street1=data.street1,
            street2=data.street2,
            city=data.city,
            region=region,
            postal_code=data.postal_code,
            country=data.country,
        )
    )
    suggestion = None
    if result.normalized is not None:
        n = result.normalized
        suggestion = AddressVerifyIn(
            street1=n.street1,
            street2=n.street2,
            city=n.city,
            region=n.region,
            postal_code=n.postal_code,
            country=n.country,  # type: ignore[arg-type]
        )
    return AddressVerifyOut(
        is_valid=result.is_valid,
        source=result.source,
        simulated=result.source == "mock",
        messages=result.messages,
        suggestion=suggestion,
    )
