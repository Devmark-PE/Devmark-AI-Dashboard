"""Modo reposo: pausar la IA descarga el modelo y bloquea el chat; activarla lo vuelve a cargar."""

import json

import httpx

from app.services import ai_state


def chat(client, key):
    return client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "hola"}]}, headers={"Authorization": f"Bearer {key}"})


def test_pause_and_resume(app_and_key, ollama):
    client, csrf, app_, key = app_and_key
    ollama.get("/api/ps").mock(return_value=httpx.Response(200, json={"models": [{"name": "llama3.2:1b"}]}))
    generate = ollama.post("/api/generate").mock(return_value=httpx.Response(200, json={"done": True}))

    state = client.get("/api/admin/ai-power").json()
    assert state["paused"] is False and state["loaded_models"] == ["llama3.2:1b"]
    assert client.post("/api/admin/ai-power", json={"paused": True}).status_code == 403  # CSRF

    r = client.post("/api/admin/ai-power", json={"paused": True}, headers=csrf)
    assert r.status_code == 200 and r.json()["paused"] is True and r.json()["changed_by"] == "admin@devmark.test"
    assert json.loads(generate.calls.last.request.content) == {"model": "llama3.2:1b", "keep_alive": 0}  # descarga

    calls_before = len(ollama.calls)
    r = chat(client, key["key"])
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_paused"
    assert not any(c.request.url.path == "/api/chat" for c in ollama.calls[calls_before:])  # no toca el modelo
    assert client.post("/api/admin/playground/chat", json={"model": "llama3.2:1b", "messages": [{"role": "user", "content": "x"}]}, headers=csrf).status_code == 503
    assert client.get("/health").json()["status"] == "paused" and client.get("/status").json()["ai"] == "paused"
    assert client.get("/api/admin/overview").json()["ai_paused"] is True

    # Persiste aunque se vacíe la caché (reinicio del proceso)
    ai_state.reset_cache()
    assert chat(client, key["key"]).status_code == 503

    r = client.post("/api/admin/ai-power", json={"paused": False}, headers=csrf)
    assert r.json()["paused"] is False
    assert json.loads(generate.calls.last.request.content) == {"model": "llama3.2:1b"}  # precarga
    assert chat(client, key["key"]).status_code == 200
    assert client.get("/health").json()["status"] == "healthy"
