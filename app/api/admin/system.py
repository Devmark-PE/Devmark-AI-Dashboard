from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.deps import AdminContext, current_admin
from app.services import system

router = APIRouter(prefix="/system", tags=["admin:system"])


@router.get("")
async def system_status(request: Request, _: AdminContext = Depends(current_admin)):
    return await system.full_status(request)
