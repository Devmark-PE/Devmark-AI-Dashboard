"""Ciclo de vida de API keys y su uso en la API pública."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import session_scope
from app.models import ApiKey, ApiRequestLog

BODY = {"messages": [{"role": "user", "content": "Hola"}]}


def bearer(key: str) -> dict:
    return {"Authorization": f"Bearer {key}"}


def test_key_shown_once_and_only_hash_stored(app_and_key):
    client, csrf, app_, key = app_and_key
    raw = key["key"]
    assert raw.startswith("dmk_live_") and len(raw) == len("dmk_live_") + 40
    assert key["masked_key"].startswith(key["prefix"]) and raw not in key["masked_key"]

    listed = client.get("/api/admin/api-keys").json()
    assert len(listed) == 1 and "key" not in listed[0]
    assert raw not in client.get("/api/admin/api-keys").text

    with session_scope() as db:
        stored = db.scalar(select(ApiKey))
        assert stored.key_hash != raw and len(stored.key_hash) == 64
        assert raw not in (stored.prefix + stored.key_hash)


def test_key_works_and_logs_request(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    r = client.post("/v1/chat/completions", json=BODY, headers=bearer(key["key"]))
    assert r.status_code == 200
    with session_scope() as db:
        log = db.scalar(select(ApiRequestLog))
        assert log.application_id is not None and str(log.application_id) == app_["id"]
        assert log.total_tokens == 17 and log.status == "success" and log.endpoint == "/v1/chat/completions"
        # No se guarda contenido por defecto.
        assert log.request_content is None and log.response_content is None
    assert client.get("/api/admin/api-keys").json()[0]["last_used_at"] is not None


def test_revoke_reactivate_delete(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    headers = bearer(key["key"])
    assert client.post(f"/api/admin/api-keys/{key['id']}/revoke", headers=csrf).json()["status"] == "revoked"
    r = client.post("/v1/chat/completions", json=BODY, headers=headers)
    assert r.status_code == 401 and r.json() == {"detail": "API key revocada"}

    assert client.post(f"/api/admin/api-keys/{key['id']}/reactivate", headers=csrf).json()["status"] == "active"
    assert client.post("/v1/chat/completions", json=BODY, headers=headers).status_code == 200

    assert client.delete(f"/api/admin/api-keys/{key['id']}", headers=csrf).status_code == 204
    assert client.post("/v1/chat/completions", json=BODY, headers=headers).status_code == 401
    # Los logs sobreviven a la key (conservan el prefijo).
    logs = client.get("/api/admin/logs").json()["items"]
    assert logs and logs[0]["api_key_id"] is None and logs[0]["key_prefix"] == key["prefix"]


def test_permissions_enforced(admin, ollama):
    client, csrf = admin
    app_ = client.post("/api/admin/applications", json={"name": "MemoAI"}, headers=csrf).json()
    key = client.post(
        "/api/admin/api-keys",
        json={"name": "Solo modelos", "application_id": app_["id"], "permissions": ["models"], "environment": "test"},
        headers=csrf,
    ).json()
    assert key["key"].startswith("dmk_test_")
    assert client.get("/v1/models", headers=bearer(key["key"])).status_code == 200
    assert client.post("/v1/chat/completions", json=BODY, headers=bearer(key["key"])).status_code == 403


def test_expired_key(admin, ollama):
    client, csrf = admin
    app_ = client.post("/api/admin/applications", json={"name": "Cliente A"}, headers=csrf).json()
    soon = (datetime.now(timezone.utc) + timedelta(seconds=2)).isoformat()
    key = client.post("/api/admin/api-keys", json={"name": "Temporal", "application_id": app_["id"], "expires_at": soon}, headers=csrf).json()
    with session_scope() as db:
        row = db.get(ApiKey, __import__("uuid").UUID(key["id"]))
        row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    r = client.post("/v1/chat/completions", json=BODY, headers=bearer(key["key"]))
    assert r.status_code == 401 and r.json() == {"detail": "API key expirada"}
    assert client.get("/api/admin/api-keys?status=expired").json()[0]["effective_status"] == "expired"
    assert client.post(f"/api/admin/api-keys/{key['id']}/reactivate", headers=csrf).status_code == 409


def test_disabled_application_blocks_keys(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    client.patch(f"/api/admin/applications/{app_['id']}", json={"status": "disabled"}, headers=csrf)
    assert client.post("/v1/chat/completions", json=BODY, headers=bearer(key["key"])).status_code == 403


def test_rate_limit_per_key(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    client.patch(f"/api/admin/api-keys/{key['id']}", json={"rate_limit_rpm": 2}, headers=csrf)
    codes = [client.post("/v1/chat/completions", json=BODY, headers=bearer(key["key"])).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


def test_legacy_key_still_works_and_is_logged(client, ollama):
    from tests.conftest import LEGACY

    assert client.post("/v1/chat/completions", json=BODY, headers=LEGACY).status_code == 200
    with session_scope() as db:
        assert db.scalar(select(ApiRequestLog)).key_prefix == "legacy"


def test_application_delete_requires_no_keys(app_and_key):
    client, csrf, app_, key = app_and_key
    assert client.delete(f"/api/admin/applications/{app_['id']}", headers=csrf).status_code == 409
    client.delete(f"/api/admin/api-keys/{key['id']}", headers=csrf)
    assert client.delete(f"/api/admin/applications/{app_['id']}", headers=csrf).status_code == 204
