"""RAG: ingesta, fragmentación, búsqueda, uso en /v1/chat/completions y Playground."""

import base64
import json

from app.services import rag
from tests.conftest import ollama_chat_reply

FAQ = """Preguntas frecuentes de la Clínica Dental Sonrisa

Horario de atención: lunes a viernes de 9:00 a 18:00 y sábados de 9:00 a 13:00.

Precios: una limpieza dental (profilaxis) cuesta S/ 120. El blanqueamiento cuesta S/ 450.
La consulta de evaluación es gratuita para pacientes nuevos.

Ubicación: Av. Larco 123, Miraflores, Lima. Hay estacionamiento para pacientes."""


def minimal_pdf(text: str) -> bytes:
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length " + str(len(stream)).encode() + b">>stream\n" + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer<</Size {len(objects) + 1}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF".encode()
    return bytes(out)


def make_app(client, csrf, name="Clínica Sonrisa"):
    return client.post("/api/admin/applications", json={"name": name}, headers=csrf).json()


def add_text(client, csrf, app_id, title="FAQ clínica", text=FAQ):
    r = client.post("/api/admin/rag/documents", json={"application_id": app_id, "title": title, "text": text}, headers=csrf)
    assert r.status_code == 201, r.text
    return r.json()


def test_normalize_and_chunking():
    assert rag.normalize("¿Cuánto CUESTA   la Limpieza?") == "¿cuanto cuesta la limpieza?"
    assert rag.query_terms("¿Cuánto cuesta la limpieza?") == ["cuánto", "cuesta", "la", "limpieza", "cuanto"]
    assert rag.index_text("Ubicación") == "ubicación\nubicacion" and rag.index_text("Precio") == "precio"
    long_text = "\n\n".join(f"Párrafo {i}. " + "palabra " * 60 for i in range(10))
    chunks = rag.chunk_text(long_text)
    assert len(chunks) > 3 and all(len(c) <= rag.CHUNK_SIZE + 10 for c in chunks)


def test_document_lifecycle_and_search(admin):
    client, csrf = admin
    app_ = make_app(client, csrf)
    doc = add_text(client, csrf, app_["id"])
    assert doc["chunk_count"] >= 1 and doc["source_type"] == "text"

    listed = client.get(f"/api/admin/rag/documents?application_id={app_['id']}").json()
    assert [d["id"] for d in listed] == [doc["id"]]
    detail = client.get(f"/api/admin/rag/documents/{doc['id']}").json()
    assert "limpieza dental" in " ".join(c["content"] for c in detail["chunks"])

    # Sin acentos / mayúsculas también encuentra
    r = client.post("/api/admin/rag/search", json={"application_id": app_["id"], "query": "¿cuánto cuesta una LIMPIEZA?"}, headers=csrf).json()
    assert r["results"] and "S/ 120" in r["results"][0]["content"]
    # Otra aplicación no ve estos documentos
    other = make_app(client, csrf, "Otra app")
    r = client.post("/api/admin/rag/search", json={"application_id": other["id"], "query": "limpieza"}, headers=csrf).json()
    assert r["results"] == []

    assert client.get("/api/admin/applications").json()[-1]["document_count"] == 1
    assert client.delete(f"/api/admin/rag/documents/{doc['id']}", headers=csrf).status_code == 204
    r = client.post("/api/admin/rag/search", json={"application_id": app_["id"], "query": "limpieza"}, headers=csrf).json()
    assert r["results"] == []


def test_upload_pdf_and_markdown(admin):
    client, csrf = admin
    app_ = make_app(client, csrf)
    pdf = base64.b64encode(minimal_pdf("Horario de atencion de soporte: lunes a viernes de 8 a 20 horas")).decode()
    r = client.post("/api/admin/rag/documents", json={"application_id": app_["id"], "title": "Soporte", "filename": "soporte.pdf", "content_base64": pdf}, headers=csrf)
    assert r.status_code == 201, r.text and r.json()["source_type"] == "pdf"
    md = base64.b64encode("# Envíos\n\nLos envíos a provincia tardan de 3 a 5 días hábiles.".encode()).decode()
    r = client.post("/api/admin/rag/documents", json={"application_id": app_["id"], "title": "Envíos", "filename": "envios.md", "content_base64": md}, headers=csrf)
    assert r.status_code == 201
    r = client.post("/api/admin/rag/search", json={"application_id": app_["id"], "query": "horario de soporte"}, headers=csrf).json()
    assert r["results"][0]["title"] == "Soporte"

    bad = client.post("/api/admin/rag/documents", json={"application_id": app_["id"], "title": "X", "filename": "a.exe", "content_base64": "AAAA"}, headers=csrf)
    assert bad.status_code == 422
    both = client.post("/api/admin/rag/documents", json={"application_id": app_["id"], "title": "X", "text": "hola", "content_base64": "AAAA"}, headers=csrf)
    assert both.status_code == 422
    assert client.post("/api/admin/rag/documents", json={"application_id": app_["id"], "title": "X", "text": "corto"}, headers=csrf).status_code == 422


def test_chat_completions_uses_rag_when_enabled(admin, ollama):
    client, csrf = admin
    app_ = make_app(client, csrf)
    add_text(client, csrf, app_["id"])
    key = client.post("/api/admin/api-keys", json={"name": "Web", "application_id": app_["id"]}, headers=csrf).json()["key"]
    headers = {"Authorization": f"Bearer {key}"}
    body = {"messages": [{"role": "system", "content": "Eres el asistente de la clínica."}, {"role": "user", "content": "¿Cuánto cuesta el blanqueamiento?"}]}

    # RAG desactivado (por defecto): no se añade contexto
    r = client.post("/v1/chat/completions", json=body, headers=headers)
    assert "rag" not in r.json()
    assert "S/ 450" not in ollama.calls.last.request.content.decode()

    # Activado en la aplicación: contexto dentro del system prompt + fuentes en la respuesta
    client.patch(f"/api/admin/applications/{app_['id']}", json={"rag_enabled": True, "rag_top_k": 2}, headers=csrf)
    r = client.post("/v1/chat/completions", json=body, headers=headers)
    assert r.status_code == 200
    sent = json.loads(ollama.calls.last.request.content)
    assert sent["messages"][0]["role"] == "system" and "S/ 450" in sent["messages"][0]["content"]
    assert sent["messages"][0]["content"].startswith("Eres el asistente de la clínica.")
    assert r.json()["rag"]["sources"][0]["title"] == "FAQ clínica" and "content" not in r.json()["rag"]["sources"][0]

    # El cliente puede desactivarlo por petición
    r = client.post("/v1/chat/completions", json={**body, "rag": False}, headers=headers)
    assert "rag" not in r.json()


def test_playground_with_and_without_rag(admin, ollama):
    client, csrf = admin
    app_ = make_app(client, csrf)
    add_text(client, csrf, app_["id"])
    msg = [{"role": "user", "content": "¿Dónde están ubicados?"}]

    r = client.post("/api/admin/playground/chat", json={"model": "llama3.2:1b", "messages": msg}, headers=csrf)
    assert r.status_code == 200 and r.json()["content"] == "Hola!" and r.json()["rag"] is None

    r = client.post("/api/admin/playground/chat", json={"model": "llama3.2:1b", "messages": msg, "application_id": app_["id"], "use_rag": True, "temperature": 0.1}, headers=csrf)
    data = r.json()
    assert data["rag"]["sources"] and "Larco" in data["rag"]["sources"][0]["content"]
    sent = json.loads(ollama.calls.last.request.content)
    assert "Larco" in sent["messages"][0]["content"] and sent["options"]["temperature"] == 0.1

    assert client.post("/api/admin/playground/chat", json={"model": "x", "messages": msg, "use_rag": True}, headers=csrf).status_code == 422
    assert client.post("/api/admin/playground/chat", json={"model": "x", "messages": msg}).status_code == 403  # sin CSRF
    logs = client.get("/api/admin/logs?endpoint=/playground").json()
    assert logs["total"] == 2 and logs["items"][0]["key_prefix"] == "playground"


def test_playground_model_error(admin, ollama):
    import httpx

    client, csrf = admin
    ollama.post("/api/chat").mock(return_value=httpx.Response(404, json={"error": "model 'nope' not found"}))
    r = client.post("/api/admin/playground/chat", json={"model": "nope", "messages": [{"role": "user", "content": "hola"}]}, headers=csrf)
    assert r.status_code == 404 and "not found" in r.json()["detail"]
    _ = ollama_chat_reply


def test_search_accents_and_stemming(admin):
    client, csrf = admin
    app_ = make_app(client, csrf)
    add_text(client, csrf, app_["id"])
    for query, expected in [
        ("¿Dónde están ubicados?", "Larco"),     # stemming: ubicados ~ ubicación
        ("ubicacion", "Larco"),                  # sin tilde
        ("horarios de atención", "lunes a viernes"),
        ("precio del blanqueamiento", "S/ 450"),
    ]:
        r = client.post("/api/admin/rag/search", json={"application_id": app_["id"], "query": query}, headers=csrf).json()
        assert r["results"] and expected in r["results"][0]["content"], (query, r)
