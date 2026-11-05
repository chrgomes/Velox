from typing import Annotated, TypeVar

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

T = TypeVar("T")


class PageParams(BaseModel):
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def _page_params(
    page: Annotated[int, Query(ge=1, le=10_000)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


Pagination = Annotated[PageParams, Depends(_page_params)]


class Page[T](BaseModel):
    items: list[T]
    page: int
    page_size: int
    total: int


def paginate(db: Session, stmt: Select, params: PageParams) -> tuple[list, int]:
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.offset(params.offset).limit(params.page_size)).all()
    return list(rows), total
