from __future__ import annotations

import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolParameter(BaseModel):
    name: str = Field(min_length=2, max_length=48)
    type: Literal["string", "number", "integer", "boolean"] = "string"
    description: str = Field(default="", max_length=300)
    required: bool = False
    enum: list[str] | None = Field(default=None, max_length=20)


class ToolHeaderIn(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9-]+$")
    # None = conservar el valor guardado (el dashboard nunca recibe el valor real).
    value: str | None = Field(default=None, max_length=4000)


class ToolIn(BaseModel):
    name: str = Field(min_length=2, max_length=48)
    description: str = Field(min_length=10, max_length=1000)
    kind: Literal["http", "web"] = "http"
    method: Literal["GET", "POST"] = "GET"
    url_template: str = Field(min_length=8, max_length=2000)
    body_template: str | None = Field(default=None, max_length=4000)
    headers: list[ToolHeaderIn] = Field(default_factory=list, max_length=10)
    parameters: list[ToolParameter] = Field(default_factory=list, max_length=8)
    response_path: str | None = Field(default=None, max_length=200)
    max_chars: int = Field(default=1500, ge=200, le=6000)
    enabled: bool = True
    application_ids: list[uuid.UUID] = Field(default_factory=list, max_length=100)


class ToolTestRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)
