"""Punto de entrada de Devmark AI (uvicorn main:app, vía el main.py de la raíz)."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from app.api import admin, public
from app.config import get_settings
from app.services import ollama

logging.basicConfig(level=logging.INFO)

DASHBOARD_CSP = "; ".join(
    [
        "default-src 'self'",
        # Next.js (export estático) inserta scripts y estilos en línea.
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ]
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    await ollama.close()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Devmark AI API",
        version="2.0.0",
        description="API propia de IA basada en Ollama",
        lifespan=lifespan,
        docs_url="/docs" if settings.enable_docs else None,
        redoc_url="/redoc" if settings.enable_docs else None,
        openapi_url="/openapi.json" if settings.enable_docs else None,
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/admin"):
            # Nada del panel de administración debe quedar en caché.
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith("/dashboard"):
            response.headers["Content-Security-Policy"] = DASHBOARD_CSP
            if "/_next/static/" not in path:
                response.headers["Cache-Control"] = "no-cache"
        return response

    app.include_router(public.router)
    app.include_router(admin.router)

    dashboard_dir = settings.dashboard_dir
    if dashboard_dir and os.path.isdir(dashboard_dir):
        app.mount("/dashboard", StaticFiles(directory=dashboard_dir, html=True), name="dashboard")
    else:
        @app.get("/dashboard", include_in_schema=False)
        async def dashboard_missing():
            return {"detail": "Dashboard no compilado. Ver deploy/DEPLOY.md"}

    return app


app = create_app()
