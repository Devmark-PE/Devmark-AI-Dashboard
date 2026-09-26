"""Tools (function calling): definición, seguridad de red, API del dashboard y uso en el chat."""

import asyncio
import json

import httpx
import pytest
import respx

from app.database import session_scope
from app.models import Tool
from app.services import tools

LEADS_URL = "https://leads.example.com/rest/v1/leads"
PUBLIC_IP = "93.184.216.34"

LEAD_TOOL = {
    "name": "buscar_lead",
    "description": "Busca un lead por nombre en la base de leads de la empresa",
    "kind": "http",
    "method": "GET",
    "url_template": LEADS_URL + "?select=nombre,ciudad,estado&nombre=ilike.*{nombre}*&ciudad=eq.{ciudad}&limit=5",
    "headers": [{"name": "apikey", "value": "sb_secret_supabase_1234567890"}],
    "parameters": [
        {"name": "nombre", "type": "string", "description": "Nombre o parte del nombre", "required": True},
        {"name": "ciudad", "type": "string", "description": "Ciudad (opcional)"},
    ],
}


@pytest.fixture
def public_dns(monkeypatch):
    async def fake_resolve(host):
        return {"leads.example.com": [PUBLIC_IP], "www.example.com": [PUBLIC_IP], "internal.example.com": ["10.0.0.5"]}.get(host, [PUBLIC_IP])

    monkeypatch.setattr(tools, "_resolve", fake_resolve)


def loaded(**overrides) -> tools.LoadedTool:
    base = dict(
        id=None, name="t", description="d", kind="http", method="GET", url_template=LEADS_URL, body_template=None,
        headers={}, parameters=[], response_path=None, max_chars=1500,
    )
    return tools.LoadedTool(**{**base, **overrides})


# ---------------------------------------------------------------------------
# Plantillas y validación
# ---------------------------------------------------------------------------


def test_render_url_encodes_values_and_drops_missing_optionals():
    template = LEAD_TOOL["url_template"]
    url = tools.render_url(template, {"nombre": "José & Cía"})
    assert url == LEADS_URL + "?select=nombre,ciudad,estado&nombre=ilike.*Jos%C3%A9%20%26%20C%C3%ADa*&limit=5"
    url = tools.render_url(template, {"nombre": "Ana", "ciudad": "Lima"})
    assert "&ciudad=eq.Lima&" in url
    assert tools.render_url("https://api.example.com/pedidos/{id}", {"id": 12}) == "https://api.example.com/pedidos/12"


def test_render_body_inserts_json_values():
    assert tools.render_body('{"q": {q}, "n": {n}}', {"q": 'di "hola"', "n": 3}) == {"q": 'di "hola"', "n": 3}


@pytest.mark.parametrize(
    ("kwargs", "message"),
    [
        ({"name": "Buscar Lead"}, "Nombre inválido"),
        ({"url_template": "ftp://x.com/{nombre}"}, "https://"),
        ({"url_template": "https://{nombre}.example.com/"}, "dominio"),
        ({"url_template": "https://x.com/?q={otro}"}, "no definidos"),
        ({"method": "POST", "body_template": "{no json"}, "JSON"),
    ],
)
def test_validate_definition_errors(kwargs, message):
    args = {"name": "buscar", "kind": "http", "method": "GET", "url_template": "https://x.com/?q={nombre}", "body_template": None,
            "parameters": [{"name": "nombre", "type": "string"}], **kwargs}
    with pytest.raises(ValueError, match=message):
        tools.validate_definition(**args)


def test_coerce_arguments():
    tool = loaded(parameters=[
        {"name": "limite", "type": "integer", "required": True},
        {"name": "activo", "type": "boolean"},
        {"name": "estado", "type": "string", "enum": ["nuevo", "cerrado"]},
    ])
    assert tools.coerce_arguments(tool, '{"limite": "5", "activo": "sí"}') == {"limite": 5, "activo": True}
    with pytest.raises(tools.ToolError, match="obligatorio"):
        tools.coerce_arguments(tool, {})
    with pytest.raises(tools.ToolError, match="uno de"):
        tools.coerce_arguments(tool, {"limite": 1, "estado": "otro"})


def test_html_to_text_and_extract_path():
    html = "<html><head><title>Promos</title><style>x{}</style></head><body><h1>Hoy</h1><p>2x1 en cafés</p><script>bad()</script></body></html>"
    assert tools.html_to_text(html) == "Promos\nHoy\n2x1 en cafés"
    assert tools.extract_path({"data": {"items": [{"n": 1}, {"n": 2}]}}, "data.items.1.n") == 2


# ---------------------------------------------------------------------------
# Seguridad de red
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("address", ["127.0.0.1", "10.0.0.5", "169.254.169.254", "192.168.1.10", "::1", "100.64.0.1"])
def test_internal_destinations_are_blocked(monkeypatch, address):
    async def fake_resolve(host):
        return [address]

    monkeypatch.setattr(tools, "_resolve", fake_resolve)
    with pytest.raises(tools.ToolError, match="interno"):
        asyncio.run(tools.ensure_public("https://evil.example.com/x"))


def test_localhost_names_blocked_without_dns():
    for url in ("http://localhost:11434/api/tags", "http://metadata.google.internal/"):
        with pytest.raises(tools.ToolError, match="interno"):
            asyncio.run(tools.ensure_public(url))


def test_redirect_to_internal_is_blocked(public_dns):
    tool = loaded(url_template="https://www.example.com/r")
    with respx.mock(assert_all_called=False) as mock:
        mock.get("https://www.example.com/r").mock(return_value=httpx.Response(302, headers={"location": "https://internal.example.com/secret"}))
        internal = mock.get("https://internal.example.com/secret").mock(return_value=httpx.Response(200, text="secreto"))
        _, result = asyncio.run(tools.execute(tool, {}))
    assert not result.ok and "interno" in result.content and not internal.called


def test_response_is_truncated_and_errors_reported(public_dns):
    tool = loaded(max_chars=200, response_path="data")
    with respx.mock() as mock:
        mock.get(LEADS_URL).mock(return_value=httpx.Response(200, json={"data": "x" * 5000}))
        _, result = asyncio.run(tools.execute(tool, {}))
    assert result.ok and len(result.content) < 220 and result.content.endswith("(recortado)")
    with respx.mock() as mock:
        mock.get(LEADS_URL).mock(return_value=httpx.Response(500))
        _, result = asyncio.run(tools.execute(tool, {}))
    assert not result.ok and "HTTP 500" in result.content


# ---------------------------------------------------------------------------
# API del dashboard
# ---------------------------------------------------------------------------


def create_tool(client, csrf, app_ids=(), **overrides):
    r = client.post("/api/admin/tools", json={**LEAD_TOOL, "application_ids": list(app_ids), **overrides}, headers=csrf)
    assert r.status_code == 201, r.text
    return r.json()


def test_tool_crud_hides_and_encrypts_secrets(app_and_key):
    client, csrf, app_, _ = app_and_key
    assert client.post("/api/admin/tools", json=LEAD_TOOL).status_code == 403  # sin CSRF
    tool = create_tool(client, csrf, [app_["id"]])
    assert tool["headers"] == [{"name": "apikey", "has_value": True, "preview": "••••7890"}]
    assert tool["applications"] == [{"id": app_["id"], "name": "DentalSoft"}]
    assert "sb_secret" not in json.dumps(client.get("/api/admin/tools").json())
    with session_scope() as db:
        stored = db.query(Tool).one().headers[0]
        assert "sb_secret" not in json.dumps(stored) and stored["value_enc"]

    # Actualizar sin reenviar el secreto lo conserva; una cabecera nueva sin valor se rechaza.
    update = {**LEAD_TOOL, "description": "Busca leads por nombre y ciudad", "headers": [{"name": "apikey", "value": None}], "application_ids": []}
    r = client.put(f"/api/admin/tools/{tool['id']}", json=update, headers=csrf)
    assert r.status_code == 200 and r.json()["headers"][0]["preview"] == "••••7890" and r.json()["applications"] == []
    bad = {**update, "headers": [{"name": "Authorization", "value": None}]}
    assert client.put(f"/api/admin/tools/{tool['id']}", json=bad, headers=csrf).status_code == 422

    assert client.post("/api/admin/tools", json={**LEAD_TOOL, "application_ids": []}, headers=csrf).status_code == 409
    assert client.post("/api/admin/tools", json={**LEAD_TOOL, "name": "x y"}, headers=csrf).status_code == 422
    assert client.delete(f"/api/admin/tools/{tool['id']}", headers=csrf).status_code == 204
    assert client.get("/api/admin/tools").json() == []


def test_tool_test_endpoint_calls_api_with_secret(app_and_key, public_dns):
    client, csrf, _, _ = app_and_key
    tool = create_tool(client, csrf)
    with respx.mock() as mock:
        route = mock.get(url__startswith=LEADS_URL).mock(return_value=httpx.Response(200, json=[{"nombre": "Ana Pérez", "ciudad": "Lima"}]))
        r = client.post(f"/api/admin/tools/{tool['id']}/test", json={"arguments": {"nombre": "Ana"}}, headers=csrf)
    body = r.json()
    assert body["ok"] and body["status_code"] == 200 and "Ana Pérez" in body["result"] and body["url"] == LEADS_URL
    sent = route.calls.last.request
    assert sent.headers["apikey"] == "sb_secret_supabase_1234567890"
    assert "nombre=ilike.*Ana*" in str(sent.url) and "ciudad" not in str(sent.url).split("select=")[1].split("&", 1)[1]


# ---------------------------------------------------------------------------
# Chat
# ---------------------------------------------------------------------------


def tool_call_reply(name, arguments):
    return {
        "model": "llama3.2:1b",
        "message": {"role": "assistant", "content": "", "tool_calls": [{"function": {"name": name, "arguments": arguments}}]},
        "prompt_eval_count": 100,
        "eval_count": 10,
        "done_reason": "stop",
    }


def final_reply(content):
    return {"model": "llama3.2:1b", "message": {"role": "assistant", "content": content}, "prompt_eval_count": 150, "eval_count": 20, "done_reason": "stop"}


def test_chat_uses_application_tools(app_and_key, ollama, public_dns):
    client, csrf, app_, key = app_and_key
    create_tool(client, csrf, [app_["id"]])
    chat = ollama.post("/api/chat").mock(
        side_effect=[
            httpx.Response(200, json=tool_call_reply("buscar_lead", {"nombre": "Ana"})),
            httpx.Response(200, json=final_reply("Ana Pérez es de Lima y está en estado nuevo.")),
        ]
    )
    ollama.route(host="leads.example.com").mock(
        return_value=httpx.Response(200, json=[{"nombre": "Ana Pérez", "ciudad": "Lima", "estado": "nuevo"}])
    )
    r = client.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "¿De dónde es Ana?"}]},
        headers={"Authorization": f"Bearer {key['key']}"},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["choices"][0]["message"]["content"].startswith("Ana Pérez")
    assert data["usage"] == {"prompt_tokens": 250, "completion_tokens": 30, "total_tokens": 280}
    assert data["tools"]["calls"][0]["name"] == "buscar_lead" and data["tools"]["calls"][0]["ok"] is True
    assert "result" not in data["tools"]["calls"][0]  # la API no reenvía el resultado crudo

    first = json.loads(chat.calls[0].request.content)
    assert first["tools"][0]["function"]["name"] == "buscar_lead"
    assert first["tools"][0]["function"]["parameters"]["required"] == ["nombre"]
    second = json.loads(chat.calls[1].request.content)
    tool_msg = second["messages"][-1]
    assert tool_msg["role"] == "tool" and tool_msg["tool_name"] == "buscar_lead" and "Ana Pérez" in tool_msg["content"]

    # server_tools=false: sin herramientas
    ollama.post("/api/chat").mock(return_value=httpx.Response(200, json=final_reply("Hola")))
    r = client.post(
        "/v1/chat/completions",
        json={"messages": [{"role": "user", "content": "hola"}], "server_tools": False},
        headers={"Authorization": f"Bearer {key['key']}"},
    )
    assert "tools" not in r.json() and "tools" not in json.loads(ollama.calls.last.request.content)


def test_unknown_tool_and_round_limit(app_and_key, ollama, public_dns):
    client, csrf, app_, key = app_and_key
    create_tool(client, csrf, [app_["id"]])
    chat = ollama.post("/api/chat").mock(
        side_effect=[httpx.Response(200, json=tool_call_reply("borrar_todo", {}))] * tools.MAX_ROUNDS
        + [httpx.Response(200, json=final_reply("No puedo hacer eso."))]
    )
    r = client.post(
        "/v1/chat/completions", json={"messages": [{"role": "user", "content": "borra"}]}, headers={"Authorization": f"Bearer {key['key']}"}
    )
    data = r.json()
    assert data["choices"][0]["message"]["content"] == "No puedo hacer eso."
    assert len(data["tools"]["calls"]) == tools.MAX_ROUNDS and not any(c["ok"] for c in data["tools"]["calls"])
    assert "tools" not in json.loads(chat.calls.last.request.content)  # última ronda: obliga a responder


def test_client_tools_openai_passthrough(client, ollama):
    from tests.conftest import LEGACY

    ollama.post("/api/chat").mock(return_value=httpx.Response(200, json=tool_call_reply("get_weather", {"city": "Lima"})))
    weather = {"type": "function", "function": {"name": "get_weather", "description": "Clima", "parameters": {"type": "object", "properties": {"city": {"type": "string"}}}}}
    r = client.post("/v1/chat/completions", json={"messages": [{"role": "user", "content": "¿Clima en Lima?"}], "tools": [weather]}, headers=LEGACY)
    choice = r.json()["choices"][0]
    assert choice["finish_reason"] == "tool_calls"
    call = choice["message"]["tool_calls"][0]
    assert call["type"] == "function" and json.loads(call["function"]["arguments"]) == {"city": "Lima"}
    assert json.loads(ollama.calls.last.request.content)["tools"][0]["function"]["name"] == "get_weather"

    # Segunda vuelta: el cliente devuelve el resultado con tool_call_id
    ollama.post("/api/chat").mock(return_value=httpx.Response(200, json=final_reply("En Lima hay 18 °C.")))
    messages = [
        {"role": "user", "content": "¿Clima en Lima?"},
        {"role": "assistant", "content": None, "tool_calls": [call]},
        {"role": "tool", "tool_call_id": call["id"], "content": '{"temp": 18}'},
    ]
    r = client.post("/v1/chat/completions", json={"messages": messages, "tools": [weather]}, headers=LEGACY)
    assert r.json()["choices"][0]["message"]["content"] == "En Lima hay 18 °C."
    sent = json.loads(ollama.calls.last.request.content)["messages"]
    assert sent[1]["tool_calls"][0]["function"]["arguments"] == {"city": "Lima"}
    assert sent[2]["tool_name"] == "get_weather"


def test_playground_shows_tool_results(app_and_key, ollama, public_dns):
    client, csrf, app_, _ = app_and_key
    create_tool(client, csrf, [app_["id"]])
    ollama.post("/api/chat").mock(
        side_effect=[
            httpx.Response(200, json=tool_call_reply("buscar_lead", {"nombre": "Ana"})),
            httpx.Response(200, json=final_reply("Encontré a Ana Pérez.")),
        ]
    )
    ollama.route(host="leads.example.com").mock(return_value=httpx.Response(200, json=[{"nombre": "Ana Pérez"}]))
    r = client.post(
        "/api/admin/playground/chat",
        json={"model": "llama3.2:1b", "messages": [{"role": "user", "content": "busca a Ana"}], "application_id": app_["id"], "use_tools": True},
        headers=csrf,
    )
    body = r.json()
    assert body["tools"]["available"] == ["buscar_lead"]
    assert body["tools"]["calls"][0]["result"] == '[{"nombre":"Ana Pérez"}]'
    status = client.get("/api/admin/system").json()
    check = next(c for c in status["checks"] if c["id"] == "tools")
    assert check["status"] == "online" and "1 activas" in check["detail"]
