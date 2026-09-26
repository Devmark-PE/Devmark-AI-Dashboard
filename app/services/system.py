"""Comprobaciones reales del estado de la infraestructura.

Regla: si algo no se pudo comprobar, se informa como "unknown", nunca como "online".
"""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import socket
import ssl
import time
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from fastapi import Request
from sqlalchemy import text

from app.config import get_settings
from app.database import get_engine
from app.services import ollama


def _check(id_: str, label: str, status: str, detail: str = "", latency_ms: int | None = None) -> dict:
    return {"id": id_, "label": label, "status": status, "detail": detail, "latency_ms": latency_ms}


def check_database() -> dict:
    engine = get_engine()
    if engine is None:
        return _check("database", "Database", "not_configured", "DATABASE_URL no está definida")
    started = time.perf_counter()
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SELECT version()")).scalar() if engine.dialect.name == "postgresql" else engine.dialect.name
    except Exception as exc:  # noqa: BLE001 - se reporta al dashboard
        return _check("database", "Database", "offline", type(exc).__name__)
    latency = round((time.perf_counter() - started) * 1000)
    short = str(version).split(" on ")[0] if version else ""
    return _check("database", "Database", "online", short, latency)


def _tls_certificate(host: str, port: int = 443, timeout: float = 3.0) -> dict:
    context = ssl.create_default_context()
    with socket.create_connection((host, port), timeout=timeout) as sock:
        with context.wrap_socket(sock, server_hostname=host) as tls:
            cert = tls.getpeercert()
            protocol = tls.version()
    not_after = datetime.fromtimestamp(ssl.cert_time_to_seconds(cert["notAfter"]), tz=timezone.utc)
    return {"not_after": not_after, "protocol": protocol}


async def check_https() -> dict:
    host = urlparse(get_settings().public_base_url).hostname
    if not host:
        return _check("https", "HTTPS", "unknown", "PUBLIC_BASE_URL inválida")
    started = time.perf_counter()
    try:
        info = await asyncio.wait_for(asyncio.to_thread(_tls_certificate, host), timeout=4.0)
    except ssl.SSLCertVerificationError:
        return _check("https", "HTTPS", "offline", "Certificado inválido")
    except Exception as exc:  # noqa: BLE001
        return _check("https", "HTTPS", "unknown", f"No se pudo comprobar ({type(exc).__name__})")
    days = (info["not_after"] - datetime.now(timezone.utc)).days
    status = "online" if days > 14 else "warning" if days > 0 else "offline"
    latency = round((time.perf_counter() - started) * 1000)
    return _check("https", "HTTPS", status, f"{info['protocol']} · certificado vence en {days} días", latency)


async def check_nginx(request: Request) -> dict:
    """Comprobación real: pide {PUBLIC_BASE_URL}/health por Internet y verifica que responde Nginx
    y que llega a FastAPI (200 o 503 son respuestas de FastAPI)."""
    url = get_settings().public_base_url + "/health"
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
            response = await client.get(url)
        latency = round((time.perf_counter() - started) * 1000)
        server = response.headers.get("server", "")
        if server.lower().startswith("nginx") and response.status_code in (200, 503):
            return _check("nginx", "Nginx", "online", f"Reverse proxy → FastAPI (HTTP {response.status_code})", latency)
        return _check("nginx", "Nginx", "warning", f"Respuesta inesperada: HTTP {response.status_code}, server «{server or '—'}»", latency)
    except Exception:  # noqa: BLE001 - sin salida a Internet: se usa la evidencia de esta petición
        pass
    # Plan B: FastAPI solo escucha en 127.0.0.1, así que estas cabeceras solo pueden venir de Nginx.
    if "x-real-ip" in request.headers or "x-forwarded-for" in request.headers:
        proto = request.headers.get("x-forwarded-proto", "?")
        return _check("nginx", "Nginx", "online", f"Petición recibida vía reverse proxy ({proto})")
    return _check("nginx", "Nginx", "unknown", "No se pudo comprobar (esta petición no pasó por Nginx)")


async def check_ollama() -> tuple[dict, dict, str | None]:
    settings = get_settings()
    started = time.perf_counter()
    try:
        version = await ollama.version()
        models = await ollama.list_models()
    except ollama.OllamaError as exc:
        return (
            _check("ollama", "Ollama", "offline", exc.message),
            _check("model", "Modelo por defecto", "unknown", settings.default_model),
            None,
        )
    latency = round((time.perf_counter() - started) * 1000)
    installed = {m.get("name") for m in models}
    model_check = (
        _check("model", "Modelo por defecto", "online", settings.default_model)
        if settings.default_model in installed
        else _check("model", "Modelo por defecto", "offline", f"{settings.default_model} no está instalado")
    )
    return (
        _check("ollama", "Ollama", "online", f"v{version} · {len(models)} modelos", latency),
        model_check,
        version,
    )


def host_metrics() -> dict:
    metrics: dict = {"hostname": socket.gethostname(), "arch": platform.machine(), "python": platform.python_version()}
    try:
        meminfo = {}
        with open("/proc/meminfo") as fh:
            for line in fh:
                key, value = line.split(":", 1)
                meminfo[key] = int(value.strip().split()[0]) * 1024
        metrics["memory"] = {"total": meminfo["MemTotal"], "available": meminfo["MemAvailable"]}
        metrics["swap"] = {"total": meminfo.get("SwapTotal", 0), "free": meminfo.get("SwapFree", 0)}
    except (OSError, KeyError, ValueError):
        metrics["memory"] = None
        metrics["swap"] = None
    try:
        usage = shutil.disk_usage("/")
        metrics["disk"] = {"total": usage.total, "free": usage.free}
    except OSError:
        metrics["disk"] = None
    try:
        metrics["load"] = list(os.getloadavg())
        metrics["cpus"] = os.cpu_count()
    except OSError:
        metrics["load"] = None
    try:
        with open("/proc/uptime") as fh:
            metrics["uptime_seconds"] = int(float(fh.read().split()[0]))
    except (OSError, ValueError):
        metrics["uptime_seconds"] = None
    return metrics


def check_rag() -> dict:
    engine = get_engine()
    if engine is None:
        return _check("rag", "RAG", "not_configured", "Requiere base de datos")
    try:
        from app.database import session_scope
        from app.services import rag

        with session_scope() as db:
            documents, chunks = rag.stats(db)
    except Exception as exc:  # noqa: BLE001
        return _check("rag", "RAG", "offline", type(exc).__name__)
    return _check("rag", "RAG", "online", f"Texto completo (español) · {documents} documentos · {chunks} fragmentos")


def check_tools() -> dict:
    if get_engine() is None:
        return _check("tools", "Tools", "not_configured", "Requiere base de datos")
    try:
        from sqlalchemy import func, select

        from app.database import session_scope
        from app.models import Tool, application_tools

        with session_scope() as db:
            active = db.scalar(select(func.count()).select_from(Tool).where(Tool.enabled.is_(True))) or 0
            assigned = db.scalar(select(func.count(func.distinct(application_tools.c.application_id)))) or 0
    except Exception as exc:  # noqa: BLE001
        return _check("tools", "Tools", "offline", type(exc).__name__)
    if not active:
        return _check("tools", "Tools", "not_configured", "Sin herramientas activas (créalas en Herramientas)")
    return _check("tools", "Tools", "online", f"Function calling · {active} activas · {assigned} aplicaciones")


async def full_status(request: Request) -> dict:
    (ollama_check, model_check, ollama_version), https_check, db_check, nginx_check = await asyncio.gather(
        check_ollama(),
        check_https(),
        asyncio.to_thread(check_database),
        check_nginx(request),
    )
    rag_check, tools_check = await asyncio.gather(asyncio.to_thread(check_rag), asyncio.to_thread(check_tools))
    checks = [
        _check("api", "API Gateway", "online", "FastAPI respondiendo"),
        nginx_check,
        https_check,
        ollama_check,
        model_check,
        db_check,
        rag_check,
        tools_check,
    ]
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "host": host_metrics(),
        "versions": {"ollama": ollama_version},
    }
