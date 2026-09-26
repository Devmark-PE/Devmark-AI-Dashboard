"""Autenticación del dashboard y endpoints de administración."""

from tests.conftest import ADMIN_EMAIL, ADMIN_PASSWORD, LEGACY


def test_admin_requires_session(client):
    assert client.get("/api/admin/api-keys").status_code == 401
    assert client.get("/api/admin/overview").status_code == 401


def test_api_key_cannot_access_dashboard(client):
    assert client.get("/api/admin/api-keys", headers=LEGACY).status_code == 401


def test_login_wrong_password_and_throttle(admin):
    client, _ = admin
    client.cookies.clear()
    for _ in range(5):
        assert client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": "mala"}).status_code == 401
    r = client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 429


def test_session_cookie_flags(client):
    from app.database import session_scope
    from app.models import User
    from app.services.passwords import hash_password

    with session_scope() as db:
        db.add(User(email="x@devmark.test", name="X", password_hash=hash_password(ADMIN_PASSWORD)))
        db.commit()
    r = client.post("/api/admin/auth/login", json={"email": "X@Devmark.test ", "password": ADMIN_PASSWORD})
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=strict" in cookie
    assert r.headers["cache-control"] == "no-store"


def test_csrf_required_for_mutations(admin):
    client, csrf = admin
    assert client.post("/api/admin/applications", json={"name": "Sin CSRF"}).status_code == 403
    assert client.post("/api/admin/applications", json={"name": "Sin CSRF"}, headers={"X-CSRF-Token": "x"}).status_code == 403
    assert client.post("/api/admin/applications", json={"name": "Con CSRF"}, headers=csrf).status_code == 201


def test_logout(admin):
    client, csrf = admin
    assert client.post("/api/admin/auth/logout", headers=csrf).status_code == 204
    assert client.get("/api/admin/auth/me").status_code == 401


def test_change_password(admin):
    client, csrf = admin
    bad = client.post("/api/admin/settings/password", json={"current_password": "otra-mala-clave", "new_password": "nueva-clave-segura-1"}, headers=csrf)
    assert bad.status_code == 400
    ok = client.post("/api/admin/settings/password", json={"current_password": ADMIN_PASSWORD, "new_password": "nueva-clave-segura-1"}, headers=csrf)
    assert ok.status_code == 204
    client.cookies.clear()
    assert client.post("/api/admin/auth/login", json={"email": ADMIN_EMAIL, "password": "nueva-clave-segura-1"}).status_code == 200


def test_application_slug_generation(admin):
    client, csrf = admin
    a = client.post("/api/admin/applications", json={"name": "Clínica Dental Sur"}, headers=csrf).json()
    b = client.post("/api/admin/applications", json={"name": "Clínica Dental Sur"}, headers=csrf).json()
    assert a["slug"] == "clinica-dental-sur" and b["slug"] == "clinica-dental-sur-2"
    assert client.post("/api/admin/applications", json={"name": "X y", "slug": "Mal Slug"}, headers=csrf).status_code == 422


def test_overview_usage_logs(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    headers = {"Authorization": f"Bearer {key['key']}"}
    for _ in range(3):
        client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "hi"}]}, headers=headers)
    client.post("/v1/chat/completions", json={"model": "nope", "messages": [{"role": "user", "content": "hi"}]}, headers=headers)

    overview = client.get("/api/admin/overview").json()
    assert overview["total_requests"] == 4 and overview["ollama_status"] == "online"
    assert overview["today"]["requests"] == 4 and overview["today"]["tokens"] == 4 * 17
    assert len(overview["recent_requests"]) == 4 and len(overview["today_series"]) == 24

    usage = client.get("/api/admin/usage?range=7d").json()
    assert usage["totals"]["requests"] == 4 and len(usage["series"]) == 7
    assert usage["by_application"][0]["name"] == "DentalSoft"

    logs = client.get("/api/admin/logs?status=success").json()
    assert logs["total"] == 4  # el mock responde 200 también para "nope"
    assert client.get("/api/admin/logs?application_id=" + app_["id"]).json()["total"] == 4
    facets = client.get("/api/admin/logs/facets").json()
    assert "/v1/chat/completions" in facets["endpoints"]
    assert client.get("/api/admin/usage?range=custom&from=2026-01-01&to=2026-12-31").status_code == 422


def test_models_and_system(admin, ollama):
    client, _ = admin
    models = client.get("/api/admin/models").json()
    assert [m["name"] for m in models["models"]] == ["llama3.2:1b", "qwen2.5:0.5b"]
    assert models["models"][0]["is_default"] and models["default_installed"]

    system = client.get("/api/admin/system").json()
    by_id = {c["id"]: c for c in system["checks"]}
    assert by_id["ollama"]["status"] == "online"
    assert by_id["database"]["status"] == "online"
    assert by_id["model"]["status"] == "online"
    assert by_id["nginx"]["status"] == "unknown"  # la petición de test no pasa por Nginx
    assert by_id["https"]["status"] == "unknown"  # dominio de test inexistente: nunca "online" sin comprobar
    assert by_id["rag"]["status"] == "online" and "0 documentos" in by_id["rag"]["detail"]
    assert by_id["tools"]["status"] == "not_configured"


def test_models_when_ollama_down(admin):
    import httpx
    import respx

    client, _ = admin
    with respx.mock(base_url="http://127.0.0.1:11434") as mock:
        mock.get("/api/tags").mock(side_effect=httpx.ConnectError("down"))
        mock.get("/api/ps").mock(side_effect=httpx.ConnectError("down"))
        data = client.get("/api/admin/models").json()
    assert data["ollama_status"] == "offline" and data["models"] == []


def test_nginx_check_real_and_fallback(admin, ollama):
    import httpx

    client, _ = admin
    # 1) Comprobación real: /health por Internet responde Nginx → online con latencia
    ollama.get(url="https://example.invalid/health").mock(return_value=httpx.Response(200, headers={"server": "nginx"}, json={}))
    check = {c["id"]: c for c in client.get("/api/admin/system").json()["checks"]}["nginx"]
    assert check["status"] == "online" and check["latency_ms"] is not None

    # 2) Otro servidor responde → warning, nunca online
    ollama.get(url="https://example.invalid/health").mock(return_value=httpx.Response(200, headers={"server": "cloudflare"}))
    assert {c["id"]: c for c in client.get("/api/admin/system").json()["checks"]}["nginx"]["status"] == "warning"

    # 3) Sin salida a Internet pero la petición trae cabeceras del proxy → online (plan B)
    ollama.get(url="https://example.invalid/health").mock(side_effect=httpx.ConnectError("no route"))
    r = client.get("/api/admin/system", headers={"X-Real-IP": "203.0.113.5", "X-Forwarded-Proto": "https"})
    assert {c["id"]: c for c in r.json()["checks"]}["nginx"]["status"] == "online"
