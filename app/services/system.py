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


def check_nginx(request: Request) -> dict:
    client = request.client.host if request.client else ""
    proxied = client in {"127.0.0.1", "::1"} and (
        "x-forwarded-for" in request.headers or "x-real-ip" in request.headers
    )
    if proxied:
        proto = request.headers.get("x-forwarded-proto", "?")
        return _check("nginx", "Nginx", "online", f"Petición recibida vía reverse proxy ({proto})")
    return _check("nginx", "Nginx", "unknown", "Esta petición no pasó por Nginx")


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


async def full_status(request: Request) -> dict:
    (ollama_check, model_check, ollama_version), https_check, db_check = await asyncio.gather(
        check_ollama(),
        check_https(),
        asyncio.to_thread(check_database),
    )
    checks = [
        _check("api", "API Gateway", "online", "FastAPI respondiendo"),
        check_nginx(request),
        https_check,
        ollama_check,
        model_check,
        db_check,
        _check("rag", "RAG", "not_configured", "Pendiente (PostgreSQL + pgvector)"),
        _check("tools", "Tools", "not_configured", "Pendiente (function calling)"),
    ]
    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "host": host_metrics(),
        "versions": {"ollama": ollama_version},
    }
