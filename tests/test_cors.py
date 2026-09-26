"""CORS limitado a /v1/models y /v1/chat/completions para el origen permitido."""

from tests.conftest import LEGACY

ORIGIN = "https://devmark-pe.github.io"


def preflight(client, path, origin=ORIGIN, method="POST"):
    return client.options(
        path,
        headers={"Origin": origin, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization,content-type"},
    )


def test_preflight_allowed_paths(client):
    for path, method in (("/v1/chat/completions", "POST"), ("/v1/models", "GET")):
        r = preflight(client, path, method=method)
        assert r.status_code == 200
        assert r.headers["access-control-allow-origin"] == ORIGIN
        assert "access-control-allow-credentials" not in r.headers
        assert set(r.headers["access-control-allow-headers"].lower().split(", ")) >= {"authorization", "content-type"}


def test_actual_request_gets_cors_headers(client, ollama):
    r = client.get("/v1/models", headers={**LEGACY, "Origin": ORIGIN})
    assert r.status_code == 200 and r.headers["access-control-allow-origin"] == ORIGIN
    # Los errores también llevan CORS, para que el navegador pueda leer el 401.
    r = client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "x"}]}, headers={"Origin": ORIGIN})
    assert r.status_code == 401 and r.headers["access-control-allow-origin"] == ORIGIN


def test_other_origins_rejected(client):
    r = preflight(client, "/v1/chat/completions", origin="https://evil.example")
    assert r.status_code == 400 and "access-control-allow-origin" not in r.headers


def test_other_paths_have_no_cors(client, ollama):
    for path in ("/health", "/chat", "/status", "/api/admin/auth/login", "/api/admin/api-keys"):
        r = preflight(client, path)
        assert "access-control-allow-origin" not in r.headers, path
    r = client.get("/health", headers={"Origin": ORIGIN})
    assert "access-control-allow-origin" not in r.headers
