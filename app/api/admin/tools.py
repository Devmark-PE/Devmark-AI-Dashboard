"""Herramientas (function calling) configurables desde el dashboard."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import AdminContext, current_admin, get_admin_db
from app.models import Application, Tool
from app.schemas.tools import ToolIn, ToolTestRequest
from app.services import secrets, tools

router = APIRouter(prefix="/tools", tags=["admin:tools"])


def _tool_out(tool: Tool) -> dict:
    headers = []
    for h in tool.headers or []:
        try:
            hint = secrets.preview(secrets.decrypt(h["value_enc"])) if h.get("value_enc") else ""
        except secrets.SecretError:
            hint = "no se puede leer"
        headers.append({"name": h["name"], "has_value": bool(h.get("value_enc")), "preview": hint})
    apps = sorted(tool.applications, key=lambda a: a.name.lower())
    return {
        "id": str(tool.id),
        "name": tool.name,
        "description": tool.description,
        "kind": tool.kind,
        "method": tool.method,
        "url_template": tool.url_template,
        "body_template": tool.body_template,
        "headers": headers,
        "parameters": tool.parameters or [],
        "response_path": tool.response_path,
        "max_chars": tool.max_chars,
        "enabled": tool.enabled,
        "applications": [{"id": str(a.id), "name": a.name} for a in apps],
        "created_at": tool.created_at.isoformat(),
        "updated_at": tool.updated_at.isoformat(),
    }


def _tool_or_404(db: Session, tool_id: uuid.UUID) -> Tool:
    tool = db.get(Tool, tool_id)
    if tool is None:
        raise HTTPException(status_code=404, detail="Herramienta no encontrada")
    return tool


def _apply(db: Session, tool: Tool, body: ToolIn) -> None:
    parameters = [p.model_dump(exclude_none=True) for p in body.parameters]
    body_template = (body.body_template or "").strip() or None
    try:
        tools.validate_definition(body.name, body.kind, body.method, body.url_template.strip(), body_template, parameters)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    previous = {h["name"].lower(): h.get("value_enc") for h in tool.headers or []}
    headers = []
    for h in body.headers:
        if h.value is not None and h.value != "":
            headers.append({"name": h.name, "value_enc": secrets.encrypt(h.value)})
        elif previous.get(h.name.lower()):
            headers.append({"name": h.name, "value_enc": previous[h.name.lower()]})
        else:
            raise HTTPException(status_code=422, detail=f"Falta el valor de la cabecera {h.name}")

    apps = db.scalars(select(Application).where(Application.id.in_(body.application_ids))).all() if body.application_ids else []
    if len(apps) != len(set(body.application_ids)):
        raise HTTPException(status_code=404, detail="Alguna aplicación no existe")

    tool.name = body.name
    tool.description = body.description.strip()
    tool.kind = body.kind
    tool.method = body.method
    tool.url_template = body.url_template.strip()
    tool.body_template = body_template if body.method == "POST" else None
    tool.headers = headers
    tool.parameters = parameters
    tool.response_path = (body.response_path or "").strip() or None
    tool.max_chars = body.max_chars
    tool.enabled = body.enabled
    tool.applications = list(apps)


def _commit(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ya existe una herramienta con ese nombre") from exc


@router.get("")
def list_tools(db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    return [_tool_out(t) for t in db.scalars(select(Tool).order_by(Tool.name)).all()]


@router.post("", status_code=201)
def create_tool(body: ToolIn, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    tool = Tool(headers=[], parameters=[])
    _apply(db, tool, body)
    db.add(tool)
    _commit(db)
    db.refresh(tool)
    return _tool_out(tool)


@router.get("/{tool_id}")
def get_tool(tool_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    return _tool_out(_tool_or_404(db, tool_id))


@router.put("/{tool_id}")
def update_tool(tool_id: uuid.UUID, body: ToolIn, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    tool = _tool_or_404(db, tool_id)
    _apply(db, tool, body)
    _commit(db)
    db.refresh(tool)
    return _tool_out(tool)


@router.delete("/{tool_id}", status_code=204)
def delete_tool(tool_id: uuid.UUID, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    db.delete(_tool_or_404(db, tool_id))
    db.commit()


@router.post("/{tool_id}/test")
async def test_tool(tool_id: uuid.UUID, body: ToolTestRequest, db: Session = Depends(get_admin_db), _: AdminContext = Depends(current_admin)):
    """Ejecuta la herramienta con argumentos de prueba (sin pasar por el modelo)."""
    tool = _tool_or_404(db, tool_id)
    try:
        loaded = tools.LoadedTool.from_model(tool)
    except secrets.SecretError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    args, result = await tools.execute(loaded, body.arguments)
    return {
        "ok": result.ok,
        "arguments": args,
        "status_code": result.status_code,
        "ms": result.ms,
        "url": result.url,
        "result": result.content,
    }
