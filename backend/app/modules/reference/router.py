from fastapi import APIRouter

from app.modules.reference.data import COUNTRIES

router = APIRouter(prefix="/reference", tags=["reference"])


@router.get("/countries")
def list_countries() -> list[dict]:
    return [
        {
            "code": code,
            "name": info["name"],
            "currency": info["currency"],
            "postal_label": info["postal_label"],
            "regions": [{"code": r, "name": n} for r, n in sorted(info["regions"].items(), key=lambda x: x[1])],
        }
        for code, info in COUNTRIES.items()
    ]
