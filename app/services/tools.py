"""Tools (function calling): el modelo pide datos a sistemas externos y responde con ellos.

Flujo en /v1/chat/completions y el Playground:
  1. Se envían al modelo las herramientas de la aplicación (formato de Ollama/OpenAI).
  2. Si el modelo pide una, el servidor la ejecuta (HTTP a la API configurada) y le devuelve el resultado.
  3. Máximo MAX_ROUNDS rondas; después el modelo debe responder con lo que tiene.

Seguridad:
  - Solo se llama a lo que el administrador configuró: el modelo rellena parámetros, no URLs ni SQL.
  - Nunca a direcciones internas (127.0.0.1, 10.x, 172.16-31.x, 192.168.x, 169.254.169.254 de AWS, …):
    se valida el DNS antes de cada petición y en cada redirección (máx. 3).
  - Tiempo máximo, tamaño máximo de respuesta y resultado recortado para el contexto del modelo.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import re
import socket
import time
import uuid
from dataclasses import dataclass, field
from html.parser import HTMLParser
from typing import Any
from urllib.parse import parse_qsl, quote, urljoin, urlsplit, urlunsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Tool, application_tools
from app.services import ollama, secrets

NAME_RE = re.compile(r"^[a-z][a-z0-9_]{1,47}$")
PLACEHOLDER_RE = re.compile(r"\{([a-z][a-z0-9_]*)\}")
PARAM_TYPES = {"string", "number", "integer", "boolean"}
MAX_ROUNDS = 3
MAX_CALLS_PER_ROUND = 3
MAX_REDIRECTS = 3
MAX_RESPONSE_BYTES = 1_000_000
TIMEOUT_SECONDS = 10.0
USER_AGENT = "DevmarkAI-Tools/1.0"

SYSTEM_HINT = (
    "Tienes herramientas para consultar datos reales. Úsalas solo si la pregunta necesita esos datos; "
    "si no, responde directamente. Cuando uses una, responde basándote en su resultado, sin inventar datos. "
    "Si la herramienta devuelve un error o nada, dilo con claridad."
)


class ToolError(Exception):
    """Error al ejecutar una herramienta (el mensaje se devuelve al modelo y al dashboard)."""


# ---------------------------------------------------------------------------
# Definición
# ---------------------------------------------------------------------------


@dataclass
class LoadedTool:
    """Copia de una Tool lista para ejecutar (cabeceras ya descifradas), independiente de la sesión de BD."""

    id: uuid.UUID
    name: str
    description: str
    kind: str
    method: str
    url_template: str
    body_template: str | None
    headers: dict[str, str]
    parameters: list[dict[str, Any]]
    response_path: str | None
    max_chars: int

    @classmethod
    def from_model(cls, tool: Tool) -> LoadedTool:
        headers = {}
        for h in tool.headers or []:
            if h.get("value_enc"):
                headers[h["name"]] = secrets.decrypt(h["value_enc"])
        return cls(
            id=tool.id,
            name=tool.name,
            description=tool.description,
            kind=tool.kind,
            method=tool.method,
            url_template=tool.url_template,
            body_template=tool.body_template,
            headers=headers,
            parameters=list(tool.parameters or []),
            response_path=tool.response_path,
            max_chars=tool.max_chars,
        )

    def spec(self) -> dict[str, Any]:
        """Definición de la función para el modelo (formato OpenAI/Ollama)."""
        properties = {}
        for p in self.parameters:
            prop: dict[str, Any] = {"type": p.get("type", "string"), "description": p.get("description", "")}
            if p.get("enum"):
                prop["enum"] = p["enum"]
            properties[p["name"]] = prop
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": [p["name"] for p in self.parameters if p.get("required")],
                },
            },
        }


def validate_definition(
    name: str, kind: str, method: str, url_template: str, body_template: str | None, parameters: list[dict[str, Any]]
) -> None:
    """Valida una herramienta antes de guardarla. Lanza ValueError con un mensaje para el dashboard."""
    if not NAME_RE.match(name):
        raise ValueError("Nombre inválido: minúsculas, números y guion bajo; empieza con letra (ej. buscar_lead)")
    if kind not in {"http", "web"}:
        raise ValueError("Tipo inválido")
    if method not in {"GET", "POST"}:
        raise ValueError("Método inválido (GET o POST)")
    if kind == "web" and method != "GET":
        raise ValueError("Una página web se lee con GET")
    names = [p["name"] for p in parameters]
    if len(names) != len(set(names)):
        raise ValueError("Hay parámetros repetidos")
    for p in parameters:
        if not NAME_RE.match(p["name"]):
            raise ValueError(f"Parámetro inválido: {p['name']!r} (minúsculas, números y guion bajo)")
        if p.get("type", "string") not in PARAM_TYPES:
            raise ValueError(f"Tipo de parámetro inválido: {p.get('type')}")
    used = set(PLACEHOLDER_RE.findall(url_template)) | set(PLACEHOLDER_RE.findall(body_template or ""))
    unknown = used - set(names)
    if unknown:
        raise ValueError(f"La URL o el cuerpo usan parámetros no definidos: {', '.join(sorted(unknown))}")
    parts = urlsplit(PLACEHOLDER_RE.sub("x", url_template))
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ValueError("La URL debe empezar por https:// (o http://) e incluir el dominio")
    if PLACEHOLDER_RE.search(urlsplit(url_template).netloc):
        raise ValueError("El dominio de la URL no puede depender de un parámetro")
    if body_template and method == "POST":
        try:
            json.loads(PLACEHOLDER_RE.sub("null", body_template))
        except ValueError as exc:
            raise ValueError("El cuerpo debe ser JSON válido (usa {parametro} sin comillas para insertar valores)") from exc


def load_for_application(db: Session, application_id: uuid.UUID) -> list[LoadedTool]:
    rows = db.scalars(
        select(Tool)
        .join(application_tools, application_tools.c.tool_id == Tool.id)
        .where(application_tools.c.application_id == application_id, Tool.enabled.is_(True))
        .order_by(Tool.name)
    ).all()
    loaded = []
    for tool in rows:
        try:
            loaded.append(LoadedTool.from_model(tool))
        except secrets.SecretError:
            continue  # no se puede usar sin sus credenciales
    return loaded


# ---------------------------------------------------------------------------
# Argumentos y plantillas
# ---------------------------------------------------------------------------


def coerce_arguments(tool: LoadedTool, raw: Any) -> dict[str, Any]:
    if isinstance(raw, str):
        try:
            raw = json.loads(raw) if raw.strip() else {}
        except ValueError as exc:
            raise ToolError("Argumentos inválidos (no es JSON)") from exc
    if not isinstance(raw, dict):
        raise ToolError("Argumentos inválidos")
    args: dict[str, Any] = {}
    for p in tool.parameters:
        name, kind = p["name"], p.get("type", "string")
        value = raw.get(name)
        if value is None or value == "":
            if p.get("required"):
                raise ToolError(f"Falta el parámetro obligatorio «{name}»")
            continue
        try:
            if kind == "integer":
                value = int(float(value))
            elif kind == "number":
                value = float(value)
            elif kind == "boolean":
                value = value if isinstance(value, bool) else str(value).strip().lower() in {"true", "1", "si", "sí", "yes"}
            else:
                value = str(value)[:500]
        except (TypeError, ValueError) as exc:
            raise ToolError(f"El parámetro «{name}» debe ser {kind}") from exc
        if p.get("enum") and value not in p["enum"]:
            raise ToolError(f"«{name}» debe ser uno de: {', '.join(map(str, p['enum']))}")
        args[name] = value
    return args


def _as_text(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def render_url(template: str, args: dict[str, Any]) -> str:
    """Rellena {param} con valores codificados. Los parámetros de la query cuyo valor usa un parámetro
    opcional no enviado se eliminan (así `&ciudad=eq.{ciudad}` desaparece si no hay ciudad)."""
    parts = urlsplit(template)
    kept = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        missing = [n for n in PLACEHOLDER_RE.findall(key + value) if n not in args]
        if not missing:
            kept.append((key, value))

    def fill(text: str) -> str:
        return PLACEHOLDER_RE.sub(lambda m: quote(_as_text(args.get(m.group(1), "")), safe=""), text)

    # Se reconstruye la query sin volver a codificar los valores ya insertados.
    query = "&".join(f"{quote(k, safe='*.,()')}={fill(quote(v, safe='*.,(){}:'))}" for k, v in kept)
    path = fill(parts.path)
    return urlunsplit((parts.scheme, parts.netloc, path, query, ""))


def render_body(template: str | None, args: dict[str, Any]) -> Any:
    if not template:
        return args
    text = PLACEHOLDER_RE.sub(lambda m: json.dumps(args.get(m.group(1)), ensure_ascii=False), template)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Red: solo destinos públicos
# ---------------------------------------------------------------------------


async def _resolve(host: str) -> list[str]:
    infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    return [info[4][0] for info in infos]


async def ensure_public(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise ToolError("URL no permitida")
    host = parts.hostname
    if host == "localhost" or host.endswith(".localhost") or host.endswith(".internal"):
        raise ToolError("Destino interno no permitido")
    try:
        addresses = await _resolve(host)
    except OSError as exc:
        raise ToolError(f"No se pudo resolver {host}") from exc
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise ToolError("Destino interno no permitido")


class _TextExtractor(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "template", "head"}
    BLOCK = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "section", "article", "header", "footer"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.title = ""
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
        elif tag in self.SKIP:
            self._skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag in self.SKIP and self._skip:
            self._skip -= 1

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    parser = _TextExtractor()
    parser.feed(html)
    text = re.sub(r"[ \t\r\f\v]+", " ", "".join(parser.parts))
    text = re.sub(r"\n\s*\n+", "\n", text).strip()
    title = parser.title.strip()
    return f"{title}\n{text}" if title else text


def extract_path(data: Any, path: str | None) -> Any:
    if not path:
        return data
    for part in path.split("."):
        if isinstance(data, list):
            try:
                data = data[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(data, dict):
            data = data.get(part)
        else:
            return None
    return data


def _truncate(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit].rstrip() + " …(recortado)"


@dataclass
class ToolResult:
    ok: bool
    content: str
    status_code: int | None = None
    ms: int = 0
    url: str | None = None


async def execute(tool: LoadedTool, raw_arguments: Any, client: httpx.AsyncClient | None = None) -> tuple[dict[str, Any], ToolResult]:
    started = time.perf_counter()
    args: dict[str, Any] = {}
    try:
        args = coerce_arguments(tool, raw_arguments)
        result = await _fetch(tool, args, client)
    except ToolError as exc:
        result = ToolResult(ok=False, content=f"Error: {exc}")
    result.ms = round((time.perf_counter() - started) * 1000)
    return args, result


async def _fetch(tool: LoadedTool, args: dict[str, Any], client: httpx.AsyncClient | None) -> ToolResult:
    url = render_url(tool.url_template, args)
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, text/html;q=0.9, */*;q=0.5", **tool.headers}
    json_body = render_body(tool.body_template, args) if tool.method == "POST" else None
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT_SECONDS), follow_redirects=False)
    try:
        method = tool.method
        for _ in range(MAX_REDIRECTS + 1):
            await ensure_public(url)
            try:
                async with client.stream(method, url, headers=headers, json=json_body) as response:
                    if response.is_redirect and "location" in response.headers:
                        url = urljoin(url, response.headers["location"])
                        method, json_body = "GET", None
                        continue
                    body = b""
                    async for chunk in response.aiter_bytes():
                        body += chunk
                        if len(body) > MAX_RESPONSE_BYTES:
                            break
                    return _process(tool, response, body[:MAX_RESPONSE_BYTES], url)
            except httpx.TimeoutException as exc:
                raise ToolError("El servicio tardó demasiado en responder") from exc
            except httpx.HTTPError as exc:
                raise ToolError("No se pudo conectar con el servicio") from exc
        raise ToolError("Demasiadas redirecciones")
    finally:
        if own_client:
            await client.aclose()


def _process(tool: LoadedTool, response: httpx.Response, body: bytes, url: str) -> ToolResult:
    status = response.status_code
    safe_url = url.split("?")[0]
    if status >= 400:
        return ToolResult(ok=False, content=f"Error: el servicio respondió HTTP {status}", status_code=status, url=safe_url)
    content_type = response.headers.get("content-type", "").lower()
    text = body.decode(response.encoding or "utf-8", errors="replace")
    if tool.kind == "web" or "html" in content_type:
        content = html_to_text(text)
    elif "json" in content_type or text.lstrip().startswith(("{", "[")):
        try:
            data = extract_path(json.loads(text), tool.response_path)
            if data in (None, [], {}):
                content = "Sin resultados."
            else:
                content = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        except ValueError:
            content = text
    else:
        content = text
    return ToolResult(ok=True, content=_truncate(content.strip() or "Sin resultados.", tool.max_chars), status_code=status, url=safe_url)


# ---------------------------------------------------------------------------
# Conversación con herramientas
# ---------------------------------------------------------------------------


@dataclass
class ToolCallTrace:
    name: str
    arguments: dict[str, Any]
    ok: bool
    ms: int
    status_code: int | None = None
    result: str | None = None

    def as_dict(self, include_result: bool = False) -> dict[str, Any]:
        out: dict[str, Any] = {"name": self.name, "arguments": self.arguments, "ok": self.ok, "ms": self.ms}
        if self.status_code is not None:
            out["status_code"] = self.status_code
        if include_result:
            out["result"] = self.result
        return out


@dataclass
class ToolRun:
    data: dict[str, Any]
    prompt_tokens: int = 0
    completion_tokens: int = 0
    calls: list[ToolCallTrace] = field(default_factory=list)


def _with_hint(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if messages and messages[0].get("role") == "system":
        return [{**messages[0], "content": f"{messages[0]['content']}\n\n{SYSTEM_HINT}"}, *messages[1:]]
    return [{"role": "system", "content": SYSTEM_HINT}, *messages]


async def chat_with_tools(
    model: str, messages: list[dict[str, Any]], options: dict[str, Any] | None, tools: list[LoadedTool]
) -> ToolRun:
    """Conversación en la que el modelo puede llamar a `tools`. Devuelve la respuesta final y el registro de llamadas."""
    by_name = {t.name: t for t in tools}
    specs = [t.spec() for t in tools]
    convo = _with_hint(list(messages))
    run = ToolRun(data={})
    async with httpx.AsyncClient(timeout=httpx.Timeout(TIMEOUT_SECONDS), follow_redirects=False) as client:
        for round_number in range(MAX_ROUNDS + 1):
            last = round_number == MAX_ROUNDS
            data = await ollama.chat(model, convo, options, tools=None if last else specs)
            run.data = data
            run.prompt_tokens += data.get("prompt_eval_count", 0) or 0
            run.completion_tokens += data.get("eval_count", 0) or 0
            message = data.get("message") or {}
            calls = message.get("tool_calls") or []
            if not calls or last:
                return run
            convo.append({"role": "assistant", "content": message.get("content", ""), "tool_calls": calls})
            for call in calls[:MAX_CALLS_PER_ROUND]:
                fn = call.get("function") or {}
                name = fn.get("name", "")
                tool = by_name.get(name)
                if tool is None:
                    args, result = {}, ToolResult(ok=False, content=f"Error: la herramienta «{name}» no existe")
                else:
                    args, result = await execute(tool, fn.get("arguments") or {}, client)
                run.calls.append(ToolCallTrace(name, args, result.ok, result.ms, result.status_code, result.content))
                convo.append({"role": "tool", "content": result.content, "tool_name": name})
    return run


# ---------------------------------------------------------------------------
# Compatibilidad OpenAI (herramientas del cliente)
# ---------------------------------------------------------------------------


def openai_messages_to_ollama(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convierte tool_calls/tool_call_id del formato OpenAI al de Ollama."""
    names_by_id: dict[str, str] = {}
    out = []
    for m in messages:
        item = {"role": m["role"], "content": m.get("content") or ""}
        if m.get("tool_calls"):
            converted = []
            for call in m["tool_calls"]:
                fn = call.get("function") or {}
                arguments = fn.get("arguments") or {}
                if isinstance(arguments, str):
                    try:
                        arguments = json.loads(arguments) if arguments.strip() else {}
                    except ValueError:
                        arguments = {}
                if call.get("id"):
                    names_by_id[call["id"]] = fn.get("name", "")
                converted.append({"function": {"name": fn.get("name", ""), "arguments": arguments}})
            item["tool_calls"] = converted
        if m["role"] == "tool":
            name = m.get("name") or names_by_id.get(m.get("tool_call_id") or "", "")
            if name:
                item["tool_name"] = name
        out.append(item)
    return out


def ollama_tool_calls_to_openai(calls: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for call in calls:
        fn = call.get("function") or {}
        arguments = fn.get("arguments") or {}
        out.append(
            {
                "id": f"call_{uuid.uuid4().hex[:24]}",
                "type": "function",
                "function": {
                    "name": fn.get("name", ""),
                    "arguments": arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False),
                },
            }
        )
    return out
