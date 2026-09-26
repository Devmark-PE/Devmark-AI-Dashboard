"""Contrato de los endpoints originales: no deben cambiar para los clientes existentes."""

import httpx

from tests.conftest import LEGACY, ollama_chat_reply

BODY = {"model": "llama3.2:1b", "messages": [{"role": "user", "content": "Hola"}], "stream": False}


def test_root(client):
    assert client.get("/").json() == {"status": "online", "service": "Devmark AI API", "model": "llama3.2:1b"}


BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
SERVICE_INFO = {"status": "online", "service": "Devmark AI API", "model": "llama3.2:1b"}


def test_root_browser_redirects_to_dashboard(client):
    r = client.get("/", headers={"Accept": BROWSER_ACCEPT}, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "/dashboard/"


def test_root_json_accept_keeps_contract(client):
    r = client.get("/", headers={"Accept": "application/json"})
    assert r.status_code == 200 and r.json() == SERVICE_INFO


def test_status(client, ollama):
    r = client.get("/status")
    assert r.status_code == 200 and r.json() == {**SERVICE_INFO, "ollama": "connected", "ai": "active"}
    ollama.get("/api/version").mock(side_effect=httpx.ConnectError("down"))
    r = client.get("/status")
    assert r.status_code == 200 and r.json() == {**SERVICE_INFO, "ollama": "unreachable", "ai": "active"}

def test_health_real_check(client, ollama):
    assert client.get("/health").json() == {"status": "healthy", "ollama": "connected"}
    ollama.get("/api/version").mock(side_effect=httpx.ConnectError("down"))
    r = client.get("/health")
    assert r.status_code == 503 and r.json()["ollama"] == "unreachable"


def test_docs_disabled(client):
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404


def test_auth_error_messages_unchanged(client, ollama):
    assert client.post("/v1/chat/completions", json=BODY).json() == {"detail": "API key requerida"}
    r = client.post("/v1/chat/completions", json=BODY, headers={"Authorization": "Token abc"})
    assert r.status_code == 401 and r.json() == {"detail": "Formato de autorización inválido"}
    r = client.post("/v1/chat/completions", json=BODY, headers={"Authorization": "Bearer nope"})
    assert r.status_code == 401 and r.json() == {"detail": "API key inválida"}
    assert client.get("/v1/models").status_code == 401


def test_chat_completions_shape(client, ollama):
    r = client.post("/v1/chat/completions", json=BODY, headers=LEGACY)
    assert r.status_code == 200
    data = r.json()
    assert set(data) == {"id", "object", "created", "model", "choices", "usage", "processing_time"}
    assert data["object"] == "chat.completion"
    assert data["id"].startswith("devmark-")
    assert data["choices"] == [{"index": 0, "message": {"role": "assistant", "content": "Hola!"}, "finish_reason": "stop"}]
    assert data["usage"] == {"prompt_tokens": 12, "completion_tokens": 5, "total_tokens": 17}
    sent = ollama.calls.last.request
    assert b'"stream":false' in sent.content and b'"model":"llama3.2:1b"' in sent.content


def test_ids_are_unique(client, ollama):
    ids = {client.post("/v1/chat/completions", json=BODY, headers=LEGACY).json()["id"] for _ in range(3)}
    assert len(ids) == 3


def test_finish_reason_length(client, ollama):
    ollama.post("/api/chat").mock(return_value=httpx.Response(200, json=ollama_chat_reply(done_reason="length")))
    r = client.post("/v1/chat/completions", json=BODY, headers=LEGACY)
    assert r.json()["choices"][0]["finish_reason"] == "length"


def test_openai_options_forwarded(client, ollama):
    body = {**BODY, "temperature": 0.2, "max_tokens": 50, "messages": [{"role": "developer", "content": "Sé breve"}, {"role": "user", "content": [{"type": "text", "text": "Hola"}]}]}
    assert client.post("/v1/chat/completions", json=body, headers=LEGACY).status_code == 200
    sent = ollama.calls.last.request.content
    assert b'"num_predict":50' in sent and b'"temperature":0.2' in sent
    assert b'{"role":"system","content":"S\\u00e9 breve"}' in sent or b'"role":"system"' in sent


def test_input_limits(client, ollama):
    r = client.post("/v1/chat/completions", json={**BODY, "messages": [{"role": "user", "content": "x" * 50_000}]}, headers=LEGACY)
    assert r.status_code == 400 and r.json()["error"]["code"] == "input_too_long"
    r = client.post("/v1/chat/completions", json={**BODY, "messages": [{"role": "hacker", "content": "x"}]}, headers=LEGACY)
    assert r.status_code == 422


def test_ollama_errors_are_json(client, ollama):
    ollama.post("/api/chat").mock(side_effect=httpx.ConnectError("down"))
    r = client.post("/v1/chat/completions", json=BODY, headers=LEGACY)
    assert r.status_code == 503 and r.json()["error"]["code"] == "ollama_unavailable"
    ollama.post("/api/chat").mock(return_value=httpx.Response(404, json={"error": "model 'nope' not found"}))
    r = client.post("/v1/chat/completions", json={**BODY, "model": "nope"}, headers=LEGACY)
    assert r.status_code == 404 and r.json()["error"]["code"] == "model_not_found"
    ollama.post("/api/chat").mock(side_effect=httpx.ReadTimeout("slow"))
    assert client.post("/v1/chat/completions", json=BODY, headers=LEGACY).status_code == 504


def test_models_shape(client, ollama):
    r = client.get("/v1/models", headers=LEGACY)
    assert r.json() == {
        "object": "list",
        "data": [
            {"id": "llama3.2:1b", "object": "model", "owned_by": "devmark"},
            {"id": "qwen2.5:0.5b", "object": "model", "owned_by": "devmark"},
        ],
    }


def test_legacy_chat_endpoint_removed(client, ollama):
    # POST /chat (endpoint original sin autenticación) se eliminó: ninguna app lo usaba.
    assert client.post("/chat", json={"message": "hola"}).status_code in (404, 405)
    assert not ollama.calls


def test_llms_txt_for_ai_agents(client):
    r = client.get("/llms.txt")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    text = r.text
    assert "https://example.invalid/v1" in text and "llama3.2:1b" in text
    assert "Authorization: Bearer" in text and "nunca" in text.lower()
    assert "legacy-test-key-123" not in text and "pepper" not in text.lower()  # sin secretos
