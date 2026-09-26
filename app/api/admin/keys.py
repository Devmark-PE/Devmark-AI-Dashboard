from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.config import get_settings
from app.database import utcnow
from app.models import ApiKey, Application
from app.schemas.admin import ApiKeyCreate, ApiKeyCreated, ApiKeyOut, ApiKeyUpdate
from app.services import api_keys

router = APIRouter(prefix="/api-keys", tags=["admin:api-keys"])


def _effective_status(key: ApiKey) -> str:
    if key.status != "active":
        return "revoked"
    if key.expires_at is not None and key.expires_at <= utcnow():
        return "expired"
    return "active"


def _out(key: ApiKey, app_name: str) -> ApiKeyOut:
    return ApiKeyOut(
        id=key.id,
        name=key.name,
        prefix=key.prefix,
        masked_key=api_keys.mask(key.prefix),
        environment=key.environment,
        permissions=list(key.permissions or []),
        status=key.status,
        effective_status=_effective_status(key),
        application_id=key.application_id,
        application_name=app_name,
        rate_limit_rpm=key.rate_limit_rpm,
        created_at=key.created_at,
        last_used_at=key.last_used_at,
        revoked_at=key.revoked_at,
        expires_at=key.expires_at,
    )


def _get(db: Session, key_id: uuid.UUID) -> ApiKey:
    key = db.get(ApiKey, key_id)
    if key is None:
        raise HTTPException(status_code=404, detail="API key no encontrada")
    return key


@router.get("", response_model=list[ApiKeyOut])
def list_keys(
    application_id: uuid.UUID | None = None,
    status: Literal["active", "revoked", "expired"] | None = None,
    db: Session = Depends(get_admin_db),
    _: AdminContext = Depends(current_admin),
):
    query = select(ApiKey, Application.name).join(Application).order_by(ApiKey.created_at.desc())
    if application_id:
        query = query.where(ApiKey.application_id == application_id)
    items = [_out(key, name) for key, name in db.execute(query)]
    if status:
        items = [item for item in items if item.effective_status == status]
    return items


@router.post("", response_model=ApiKeyCreated, status_code=201)
def create_key(body: ApiKeyCreate, db: Session = Depends(get_admin_db), ctx: AdminContext = Depends(current_admin)):
    app = db.get(Application, body.application_id)
    if app is None:
        raise HTTPException(status_code=404, detail="Aplicación no encontrada")
    if body.expires_at is not None and body.expires_at <= utcnow():
        raise HTTPException(status_code=422, detail="La fecha de expiración debe ser futura")

    raw_key = api_keys.generate_key(body.environment)
    key = ApiKey(
        application_id=app.id,
        name=body.name.strip(),
        prefix=api_keys.key_prefix(raw_key),
        key_hash=api_keys.hash_key(raw_key, get_settings().api_key_pepper or ""),
        environment=body.environment,
        permissions=body.permissions,
        rate_limit_rpm=body.rate_limit_rpm,
        expires_at=body.expires_at,
        created_by_id=ctx.user.id,
    )
    db.add(key)
    db.commit()
    return ApiKeyCreated(**_out(key, app.name).model_dump(), key=raw_key)


@router.patch("/{key_id}", response_model=ApiKeyOut)
def update_key(key_id: uuid.UUID, body: ApiKeyUpdate, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    key = _get(db, key_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("name"):
        key.name = data["name"].strip()
    if data.get("permissions") is not None:
        key.permissions = data["permissions"]
    if "rate_limit_rpm" in data:
        key.rate_limit_rpm = data["rate_limit_rpm"]
    db.commit()
    return _out(key, key.application.name)


@router.post("/{key_id}/revoke", response_model=ApiKeyOut)
def revoke_key(key_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    key = _get(db, key_id)
    if key.status != "revoked":
        key.status = "revoked"
        key.revoked_at = utcnow()
        db.commit()
    return _out(key, key.application.name)


@router.post("/{key_id}/reactivate", response_model=ApiKeyOut)
def reactivate_key(key_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    key = _get(db, key_id)
    if key.expires_at is not None and key.expires_at <= utcnow():
        raise HTTPException(status_code=409, detail="La key está expirada; crea una nueva")
    if key.status != "active":
        key.status = "active"
        key.revoked_at = None
        db.commit()
    return _out(key, key.application.name)


@router.delete("/{key_id}", status_code=204)
def delete_key(key_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    key = _get(db, key_id)
    db.delete(key)
    db.commit()
