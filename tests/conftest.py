"""Configuración de tests.

Por defecto usan SQLite en memoria. Para probar contra PostgreSQL:
    TEST_DATABASE_URL=postgresql+psycopg://user:pass@127.0.0.1/devmark_test pytest
Ollama se simula con respx: los tests nunca llaman al modelo real.
"""

from __future__ import annotations

import os
import tempfile

_DB_FILE = os.path.join(tempfile.mkdtemp(), "devmark-test.db")

os.environ.update(
    {
        "DATABASE_URL": os.getenv("TEST_DATABASE_URL", f"sqlite+pysqlite:///{_DB_FILE}"),
        "API_KEY_PEPPER": "test-pepper-" + "x" * 40,
        "DEVmark_API_KEY": "legacy-test-key-123",
        "COOKIE_SECURE": "false",
        "DASHBOARD_DIR": "/nonexistent",
        "PUBLIC_BASE_URL": "https://example.invalid",
    }
)

import httpx  # noqa: E402
import pytest  # noqa: E402
import respx  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, get_engine  # noqa: E402
from app.main import app  # noqa: E402
from app.services import ai_state, rate_limit, sessions  # noqa: E402

OLLAMA = "http://127.0.0.1:11434"
LEGACY = {"Authorization": "Bearer legacy-test-key-123"}
ADMIN_EMAIL = "admin@devmark.test"
ADMIN_PASSWORD = "una-clave-segura-123"


def ollama_chat_reply(content: str = "Hola!", model: str = "llama3.2:1b", done_reason: str = "stop") -> dict:
    return {
        "model": model,
        "message": {"role": "assistant", "content": content},
        "prompt_eval_count": 12,
        "eval_count": 5,
        "done_reason": done_reason,
    }


@pytest.fixture(autouse=True)
def _clean_state():
    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    rate_limit.reset()
    sessions.reset_throttle()
    ai_state.reset_cache()
    yield


@pytest.fixture
def ollama():
    with respx.mock(base_url=OLLAMA, assert_all_called=False) as mock:
        mock.get("/api/version").mock(return_value=httpx.Response(200, json={"version": "0.34.4"}))
        mock.get("/api/tags").mock(
            return_value=httpx.Response(
                200,
                json={
                    "models": [
                        {"name": "llama3.2:1b", "size": 1321098329, "details": {"family": "llama", "parameter_size": "1.2B", "quantization_level": "Q8_0"}},
                        {"name": "qwen2.5:0.5b", "size": 397821319, "details": {"family": "qwen2", "parameter_size": "494M"}},
                    ]
                },
            )
        )
        mock.get("/api/ps").mock(return_value=httpx.Response(200, json={"models": []}))
        mock.post("/api/chat").mock(return_value=httpx.Response(200, json=ollama_chat_reply()))
        yield mock


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin(client):
    """Cliente con sesión de administrador iniciada. Devuelve (client, headers_csrf)."""
    from app.database import session_scope
    from app.models import User
    from app.services.passwords import hash_password

    with session_scope() as db:
        db.add(User(email=ADMIN_EMAIL, name="Admin", password_hash=hash_password(ADMIN_PASSWORD)))
        db.commit()
    r = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return client, {"X-CSRF-Token": r.json()["csrf_token"]}


@pytest.fixture
def app_and_key(admin):
    """Crea una aplicación y una key live. Devuelve (client, csrf, app, key)."""
    client, csrf = admin
    app_ = client.post("/api/admin/applications", json={"name": "DentalSoft"}, headers=csrf).json()
    key = client.post(
        "/api/admin/api-keys", json={"name": "Producción", "application_id": app_["id"]}, headers=csrf
    ).json()
    return client, csrf, app_, key
