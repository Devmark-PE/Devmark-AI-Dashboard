from __future__ import annotations

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.services import stats

router = APIRouter(prefix="/usage", tags=["admin:usage"])


@router.get("")
def get_usage(
    range_name: Literal["today", "7d", "30d", "custom"] = Query(default="7d", alias="range"),
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
    application_id: uuid.UUID | None = None,
    db: Session = Depends(get_admin_db),
    _: AdminContext = Depends(current_admin),
):
    try:
        r = stats.resolve_range(range_name, get_settings().dashboard_timezone, date_from, date_to)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return stats.usage(db, r, application_id)
