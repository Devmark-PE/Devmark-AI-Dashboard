"""/llms.txt: guía de integración para agentes de IA (Claude, ChatGPT, Cursor, Copilot…).

Se genera con la configuración real (URL, modelos, límites). Es pública: no contiene secretos ni datos de clientes.
"""

from __future__ import annotations

from app.config import get_settings

TEMPLATE = """# DEVMARK AI

> API privada de IA de Devmark, compatible con la API de OpenAI (Chat Completions). El modelo corre en un servidor
> propio con Ollama: los datos no se envían a terceros. Esta guía es para agentes de IA que deben conectar una
> aplicación a DEVMARK AI.

## Resumen para el agente

- Base URL: `{base}/v1`
- Autenticación: `Authorization: Bearer <API_KEY>` (keys con prefijo `dmk_live_` o `dmk_test_`)
- Endpoint principal: `POST {base}/v1/chat/completions` (formato OpenAI)
- Modelo por defecto: `{model}`{models_line}
- Sin streaming: usa siempre `"stream": false` (la respuesta llega completa)
- Compatible con los SDK oficiales de OpenAI cambiando solo `base_url`/`baseURL` y la API key

## Reglas obligatorias

1. **Pide la API key al usuario**; nunca la inventes. Se crea en el dashboard: {base}/dashboard/ → API Keys
   (se muestra una sola vez). Usa `dmk_test_…` para desarrollo y `dmk_live_…` para producción.
2. **La key va solo en el backend/servidor**, en variables de entorno. Nunca en código de navegador, apps móviles
   públicas ni en el repositorio. Añade `.env` al `.gitignore`.
3. Variables recomendadas:
   ```
   DEVMARK_BASE_URL={base}/v1
   DEVMARK_API_KEY=dmk_live_xxxxxxxx   # la entrega el usuario
   DEVMARK_MODEL={model}
   ```
4. Si la app ya usa OpenAI, **no reescribas la lógica**: cambia solo base URL, key y modelo.
5. Timeout de cliente de al menos {timeout} s: el modelo corre en CPU y puede tardar varios segundos.
6. Maneja errores 401/403/429/503/504 (ver abajo) y muestra un mensaje amable al usuario final.

## Petición

```http
POST {base}/v1/chat/completions
Authorization: Bearer $DEVMARK_API_KEY
Content-Type: application/json

{{
  "model": "{model}",
  "messages": [
    {{"role": "system", "content": "Eres el asistente de la empresa. Responde en español, breve y claro."}},
    {{"role": "user", "content": "Hola"}}
  ],
  "temperature": 0.3,
  "max_tokens": 300
}}
```

Campos: `messages` (obligatorio; roles `system`, `user`, `assistant`, `tool`), `model`, `temperature` (0–2),
`max_tokens`, `top_p`, `stop`, `tools` (function calling formato OpenAI).
Extensiones DEVMARK: `rag` (true/false: forzar o desactivar documentos de la aplicación) y `server_tools`
(false: no usar las herramientas configuradas en el servidor).

## Respuesta

```json
{{
  "id": "devmark-…",
  "object": "chat.completion",
  "model": "{model}",
  "choices": [{{"index": 0, "message": {{"role": "assistant", "content": "¡Hola! ¿En qué te ayudo?"}}, "finish_reason": "stop"}}],
  "usage": {{"prompt_tokens": 25, "completion_tokens": 9, "total_tokens": 34}},
  "rag": {{"sources": [{{"title": "Preguntas frecuentes", "ordinal": 0, "score": 0.1}}]}},
  "tools": {{"calls": [{{"name": "buscar_lead", "arguments": {{"nombre": "Ana"}}, "ok": true, "ms": 180}}]}}
}}
```

El texto está en `choices[0].message.content`. `rag` y `tools` solo aparecen si se usaron.

## Ejemplos

### Python (SDK de OpenAI)
```python
import os
from openai import OpenAI

client = OpenAI(base_url=os.environ["DEVMARK_BASE_URL"], api_key=os.environ["DEVMARK_API_KEY"], timeout={timeout})
reply = client.chat.completions.create(
    model=os.getenv("DEVMARK_MODEL", "{model}"),
    messages=[{{"role": "user", "content": "Hola"}}],
    max_tokens=300,
)
print(reply.choices[0].message.content)
```

### Node.js / TypeScript (SDK de OpenAI)
```ts
import OpenAI from "openai";

const client = new OpenAI({{ baseURL: process.env.DEVMARK_BASE_URL, apiKey: process.env.DEVMARK_API_KEY, timeout: {timeout_ms} }});
const reply = await client.chat.completions.create({{
  model: process.env.DEVMARK_MODEL ?? "{model}",
  messages: [{{ role: "user", content: "Hola" }}],
  max_tokens: 300,
}});
console.log(reply.choices[0].message.content);
```

### Sin SDK (fetch, desde el servidor)
```js
const res = await fetch(`${{process.env.DEVMARK_BASE_URL}}/chat/completions`, {{
  method: "POST",
  headers: {{ Authorization: `Bearer ${{process.env.DEVMARK_API_KEY}}`, "Content-Type": "application/json" }},
  body: JSON.stringify({{ model: "{model}", messages: [{{ role: "user", content: "Hola" }}] }}),
}});
if (!res.ok) throw new Error((await res.json()).error?.message ?? `HTTP ${{res.status}}`);
const data = await res.json();
```

### cURL
```bash
curl {base}/v1/chat/completions \\
  -H "Authorization: Bearer $DEVMARK_API_KEY" -H "Content-Type: application/json" \\
  -d '{{"model":"{model}","messages":[{{"role":"user","content":"Hola"}}]}}'
```

### Herramientas sin código (n8n, Make, Typebot, Open WebUI, plugins…)
Elige el proveedor «OpenAI» u «OpenAI compatible» y configura: Base URL `{base}/v1`, API key `dmk_…`,
modelo `{model}`.

## Otros endpoints

- `GET {base}/v1/models` (API key): modelos disponibles.
- `GET {base}/health` (público): 200 si el modelo responde, 503 si no. Útil para monitoreo.
- `GET {base}/status` (público): estado del servicio.

## Errores

Formato: `{{"error": {{"message": "…", "type": "…", "code": "…"}}}}`

| HTTP | Causa | Qué hacer |
|---|---|---|
| 400 / 422 | Entrada inválida (máx. {max_messages} mensajes, {max_chars} caracteres) | Corregir la petición |
| 401 | Key inválida, revocada o expirada | Pedir una key nueva al usuario |
| 403 | Key sin permiso o aplicación deshabilitada | Revisar la key en el dashboard |
| 404 | Modelo inexistente | Usar `{model}` |
| 429 | Límite de peticiones por minuto | Esperar ~10–60 s y reintentar (con espera creciente) |
| 503 / 504 | Modelo no disponible o lento | Reintentar 1–2 veces con espera |

## Rendimiento (servidor pequeño)

- Una generación a la vez: evita ráfagas de peticiones en paralelo.
- `max_tokens` bajo (150–400) y prompts de sistema cortos = respuestas más rápidas.
- Guarda el historial en tu app y envía solo los últimos mensajes relevantes.

## Conocimiento y herramientas del servidor

Si la aplicación de la key tiene **RAG** o **herramientas** activas (se configuran en el dashboard), la API los usa
automáticamente: la app no necesita cambios. No envíes documentos largos en el prompt; súbelos al RAG.

## Checklist para el agente

- [ ] Pedí la API key al usuario y la guardé en `.env` (backend), fuera del repositorio
- [ ] Configuré `DEVMARK_BASE_URL={base}/v1` y el modelo `{model}`
- [ ] Las llamadas se hacen desde el servidor, nunca desde el navegador
- [ ] Timeout ≥ {timeout} s y manejo de errores 401/429/503
- [ ] Probé una petición y la respuesta aparece en el dashboard → Logs con el nombre de la aplicación
"""


def render() -> str:
    s = get_settings()
    models = [m for m in s.allowed_models if m != s.default_model]
    models_line = f" (también: {', '.join(f'`{m}`' for m in models)})" if models else ""
    timeout = max(60, s.ollama_timeout_seconds)
    return TEMPLATE.format(
        base=s.public_base_url,
        model=s.default_model,
        models_line=models_line,
        timeout=timeout,
        timeout_ms=timeout * 1000,
        max_messages=s.max_messages,
        max_chars=f"{s.max_input_chars:,}".replace(",", " "),
    )
