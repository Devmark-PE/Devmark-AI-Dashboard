"""Configuración de Devmark AI.

Todo sale de variables de entorno (en producción, del .env que carga systemd).
Nunca se escriben secretos en el código.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default
    return int(value)


def _list(name: str) -> list[str]:
    value = os.getenv(name, "")
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # --- Ollama ---
    ollama_url: str = "http://127.0.0.1:11434"
    default_model: str = "llama3.2:1b"
    # Si se define, solo estos modelos se pueden usar. Vacío = cualquier modelo instalado.
    allowed_models: list[str] = field(default_factory=list)
    ollama_timeout_seconds: int = 120
    # Peticiones simultáneas hacia Ollama (con 2 GB de RAM, 1-2 es lo sensato).
    ollama_max_concurrency: int = 2

    # --- Base de datos ---
    database_url: str | None = None

    # --- API keys ---
    # Pepper para el HMAC de las API keys. Obligatorio si hay base de datos.
    api_key_pepper: str | None = None
    # Key única heredada de la primera versión (.env). Se mantiene como respaldo
    # durante la migración y se puede apagar con LEGACY_API_KEY_ENABLED=false.
    legacy_api_key: str | None = None
    legacy_api_key_enabled: bool = True

    # --- Endpoints públicos ---
    enable_docs: bool = False
    max_messages: int = 100
    max_input_chars: int = 48_000
    # Orígenes web que pueden llamar a /v1/models y /v1/chat/completions desde el navegador.
    cors_allowed_origins: list[str] = field(default_factory=list)

    # --- Dashboard / administración ---
    cookie_secure: bool = True
    session_ttl_hours: int = 12
    dashboard_dir: str | None = None
    dashboard_timezone: str = "America/Lima"
    public_base_url: str = "https://ai.devmarkpe.com"

    # --- Sesiones "mantener iniciada" ---
    remember_ttl_days: int = 30

    # --- Email (recuperación de contraseña). Opcional. ---
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None

    # --- Logs ---
    # Guardar el contenido de prompts y respuestas. Apagado por defecto.
    log_request_content: bool = False

    @property
    def database_enabled(self) -> bool:
        return bool(self.database_url)


def load_settings() -> Settings:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    default_dashboard = os.path.join(base_dir, "app", "static", "dashboard")

    settings = Settings(
        ollama_url=os.getenv("OLLAMA_URL", "http://127.0.0.1:11434").rstrip("/"),
        default_model=os.getenv("DEFAULT_MODEL", "llama3.2:1b"),
        allowed_models=_list("ALLOWED_MODELS"),
        ollama_timeout_seconds=_int("OLLAMA_TIMEOUT_SECONDS", 120),
        ollama_max_concurrency=max(1, _int("OLLAMA_MAX_CONCURRENCY", 2)),
        database_url=os.getenv("DATABASE_URL") or None,
        api_key_pepper=os.getenv("API_KEY_PEPPER") or None,
        legacy_api_key=os.getenv("DEVmark_API_KEY") or None,
        legacy_api_key_enabled=_bool("LEGACY_API_KEY_ENABLED", True),
        enable_docs=_bool("ENABLE_DOCS", False),
        max_messages=_int("MAX_MESSAGES", 100),
        max_input_chars=_int("MAX_INPUT_CHARS", 48_000),
        cors_allowed_origins=_list("CORS_ALLOWED_ORIGINS") if os.getenv("CORS_ALLOWED_ORIGINS") is not None else ["https://devmark-pe.github.io"],
        cookie_secure=_bool("COOKIE_SECURE", True),
        session_ttl_hours=_int("SESSION_TTL_HOURS", 12),
        dashboard_dir=os.getenv("DASHBOARD_DIR") or default_dashboard,
        dashboard_timezone=os.getenv("DASHBOARD_TIMEZONE", "America/Lima"),
        public_base_url=os.getenv("PUBLIC_BASE_URL", "https://ai.devmarkpe.com").rstrip("/"),
        log_request_content=_bool("LOG_REQUEST_CONTENT", False),
        remember_ttl_days=_int("REMEMBER_TTL_DAYS", 30),
        smtp_host=os.getenv("SMTP_HOST") or None,
        smtp_port=_int("SMTP_PORT", 587),
        smtp_user=os.getenv("SMTP_USER") or None,
        smtp_password=os.getenv("SMTP_PASSWORD") or None,
        smtp_from=os.getenv("SMTP_FROM") or None,
    )
    validate_settings(settings)
    return settings


def validate_settings(settings: Settings) -> None:
    if settings.database_enabled:
        if not settings.api_key_pepper or len(settings.api_key_pepper) < 32:
            raise RuntimeError(
                "API_KEY_PEPPER es obligatorio (mínimo 32 caracteres) cuando DATABASE_URL está configurada. "
                "Genera uno con: python -m app.cli generate-secret"
            )
    elif not (settings.legacy_api_key and settings.legacy_api_key_enabled):
        # Sin base de datos, la única forma de autenticar es la key heredada.
        raise RuntimeError("DEVmark_API_KEY no está configurada en .env")


@lru_cache
def get_settings() -> Settings:
    return load_settings()
