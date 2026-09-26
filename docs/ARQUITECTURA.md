# Devmark AI — Cómo funciona

Documento de referencia: qué se construyó, cómo encaja cada pieza y dónde está cada cosa.

## 1. Visión general

```
                              ┌───────────────────────── EC2 t4g.small (ARM64, 2 GB) ─────────────────────────┐
Navegador (admin) ─┐          │                                                                               │
                   ├─ HTTPS ─▶│ Nginx :443 ──▶ FastAPI 127.0.0.1:8000 ──┬──▶ Ollama 127.0.0.1:11434 (llama3.2:1b) │
Apps (API keys) ───┘          │  (TLS, límites,   (app/, un worker)     │                                      │
                              │   headers)                              │                                      │
                              └─────────────────────────────────────────┼──────────────────────────────────────┘
                                                                        └──▶ Supabase PostgreSQL (us-east-1, SSL)
```

| Pieza | Dónde corre | Qué hace |
|---|---|---|
| **Nginx** | EC2, puertos 80/443 | HTTPS (Let's Encrypt), redirección 80→443, límites por IP, headers de seguridad, bloquea `/docs` y el acceso por IP |
| **FastAPI** | EC2, `127.0.0.1:8000`, servicio `devmark-ai` | API pública, API del dashboard, sirve el dashboard estático |
| **Ollama** | EC2, `127.0.0.1:11434`, servicio `ollama` | Ejecuta el modelo. Nunca expuesto a Internet |
| **Supabase** | Nube (Postgres 17) | Usuarios, sesiones, aplicaciones, API keys (hash), logs |
| **Dashboard** | Archivos estáticos en `app/static/dashboard` | Next.js compilado; lo sirve FastAPI en `/dashboard` |

Puertos abiertos a Internet: solo 22 (SSH), 80 y 443. FastAPI, Ollama y la base de datos no son accesibles desde fuera.

## 2. Rutas

| Ruta | Acceso | Uso |
|---|---|---|
| `GET /` | Público | **Navegador → redirige al dashboard** (`/dashboard/`). API/curl/SDKs → JSON de estado (contrato original) |
| `GET /status` | Público | Estado del servicio en JSON + `ollama: connected/unreachable` (siempre 200) |
| `GET /health` | Público | `200 healthy` si Ollama responde, `503 degraded` si no |
| `POST /v1/chat/completions` | API key, permiso `chat` | Chat compatible con OpenAI |
| `GET /v1/models` | API key, permiso `models` | Modelos disponibles |
| `/dashboard/` | Login de administrador | Consola web |
| `/api/admin/*` | Cookie de sesión + CSRF | API que usa el dashboard |
| `/docs`, `/openapi.json` | Bloqueados (404) | Se activan solo con `ENABLE_DOCS=true` |

## 3. Flujo de una petición con API key

1. La app envía `Authorization: Bearer dmk_live_…` a `https://ai.devmarkpe.com/v1/chat/completions`.
2. **Nginx** aplica el límite por IP (20/min, ráfaga 10) y reenvía a FastAPI.
3. **FastAPI** (`app/api/deps.py → authenticate`):
   - si coincide con `DEVmark_API_KEY` del `.env` (key heredada) → aceptada;
   - si tiene formato `dmk_…` → calcula `HMAC-SHA256(API_KEY_PEPPER, key)` y lo busca en `api_keys`;
   - comprueba: key activa, no expirada, aplicación activa, permiso del endpoint y límite por minuto propio.
4. Valida la entrada (roles, nº de mensajes, longitud) y llama a **Ollama** (máx. `OLLAMA_MAX_CONCURRENCY` a la vez).
5. Devuelve la respuesta en formato OpenAI con `usage` real (tokens que informa Ollama).
6. En segundo plano guarda una fila en `api_request_logs` (sin el contenido del prompt, salvo `LOG_REQUEST_CONTENT=true`).

Errores: `401` key inválida/revocada/expirada · `403` sin permiso o app deshabilitada · `429` límite · `400/422` entrada inválida · `404` modelo inexistente · `503/504` Ollama caído o lento. Todos en JSON.

## 4. API keys

- Formato: `dmk_live_` o `dmk_test_` + 40 caracteres aleatorios (~238 bits).
- Se muestra **una sola vez** al crearla. En la base solo quedan el **hash HMAC** y el **prefijo visible** (`dmk_live_Ab3dE9`).
- `API_KEY_PEPPER` (en `.env`) es la llave del HMAC: si se pierde, ninguna key existente vuelve a validar. Guárdalo fuera del servidor.
- Estados: activa · revocada (reactivable) · expirada (no reactivable). Eliminar una key conserva sus logs con el prefijo.
- **¿Perdiste una key?** No se puede volver a mostrar (no se guarda). Usa **⋯ → Regenerar key**: crea una key nueva con la misma
  aplicación, nombre, permisos y límite, y la anterior (renombrada «(anterior)») sigue funcionando 0 h, 24 h o 7 días para
  cambiarla en tu app sin cortes. Endpoint: `POST /api/admin/api-keys/{id}/regenerate` con `{"grace_hours": 0|24|168}`.
- Cada key pertenece a una **aplicación**; deshabilitar la aplicación bloquea todas sus keys (403).

## 5. Dashboard y seguridad del administrador

- Usuarios propios en la tabla `users` (contraseña con **scrypt**). Se crean por CLI: `python -m app.cli create-admin`.
- Login → cookie `dmk_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, 12 h; con «Mantener sesión iniciada», 30 días).
  En la base solo se guarda el hash del token. El navegador puede guardar la contraseña (campos con `autocomplete` correcto).
- **Verificación en dos pasos (TOTP)**, opcional por usuario (Configuración): códigos de 6 dígitos de cualquier app
  autenticadora, con protección contra reutilización del mismo código, y 10 **códigos de recuperación** de un solo uso
  (solo se guarda su hash). Con 2FA activo, el login devuelve un token temporal firmado (5 min) y la sesión se crea
  solo tras el código. Desactivar 2FA o regenerar códigos exige contraseña + código.
- **Recuperar contraseña**: con SMTP configurado se envía un enlace de un solo uso (30 min, solo hash en la base);
  al usarlo se cierran todas las sesiones. La respuesta es igual exista o no el email. Sin SMTP: `app.cli reset-password`.
- Cada acción que modifica datos exige la cabecera `X-CSRF-Token` de la sesión.
- Bloqueo tras 5 intentos fallidos (15 min, en la app) + límite de Nginx en `/api/admin/auth/login`.
- Una API key **no** da acceso al dashboard.

## 6. Base de datos (Supabase)

| Tabla | Contenido |
|---|---|
| `users` | Administradores del dashboard |
| `admin_sessions` | Sesiones activas (hash del token, CSRF, IP, navegador) |
| `applications` | Apps cliente (`rate_limit_rpm`, `monthly_token_quota` preparados) |
| `api_keys` | Hash + prefijo, permisos, estado, expiración, último uso, `rate_limit_rpm` |
| `password_reset_tokens` | Enlaces de recuperación (hash, expiración, uso) |
| `api_request_logs` | Una fila por request: app, key, endpoint, modelo, tokens, tiempo, estado, error |
| `rag_documents` | Documentos de conocimiento por aplicación (título, tipo, tamaño, nº de fragmentos) |
| `rag_chunks` | Fragmentos indexados (índice FTS en español) |

- Migraciones con **Alembic** (`migrations/`). `0003` crea las tablas RAG, `0004` la 2FA y la recuperación de contraseña. `0002`–`0004` activan RLS y revoca `anon`/`authenticated`: la API REST pública de Supabase no puede leer estas tablas.
- Conexión por **Session pooler** (IPv4) con `sslmode=require`. El backend no usa ninguna key de Supabase.

## 7. Conocimiento (RAG) y Playground

**RAG por aplicación** (dashboard → *Conocimiento (RAG)*):

1. Se sube un documento (texto pegado, `.txt`, `.md` o `.pdf` con texto, máx. 8 MB) a una aplicación.
2. Se divide en fragmentos de ~700 caracteres (respetando párrafos y frases) y se guardan en `rag_chunks`.
3. PostgreSQL indexa cada fragmento con **búsqueda de texto completo en español** (`to_tsvector('spanish', …)`, índice GIN).
   Se indexa el texto con y sin acentos: «ubicados» encuentra «Ubicación» y «cuanto» encuentra «cuánto».
4. En cada pregunta se buscan los `rag_top_k` fragmentos más relevantes **de esa aplicación** y se añaden al system prompt
   con la instrucción de no inventar y citar la fuente `[n]`.

Uso desde la API: si la aplicación tiene **RAG activo**, `/v1/chat/completions` lo aplica automáticamente con sus keys.
Por petición se puede forzar o desactivar con `"rag": true|false`. La respuesta añade `rag.sources` (título, fragmento, relevancia).

No usa RAM del EC2: la búsqueda corre en Supabase. Preparado para pgvector (búsqueda semántica) añadiendo una columna
`embedding` a `rag_chunks` y combinando puntuaciones en `app/services/rag.py`, sin cambiar endpoints.

**Playground** (dashboard → *Playground*): chat con el Ollama del servidor usando la sesión de administrador (sin API key).
Permite elegir modelo, system prompt, temperatura, máx. tokens y, opcionalmente, los documentos de una aplicación;
muestra tiempo, tokens, carga del modelo y las **fuentes usadas**. Se registra en Logs como `/playground`.

## 8. Ajustes para 2 GB de RAM

- Sin PostgreSQL ni Node en el servidor (Supabase + dashboard estático).
- Ollama (drop-in `deploy/ollama/devmark.conf`): 1 modelo cargado, 1 generación a la vez, modelo en memoria 24 h, contexto de 2048 tokens.
- Con el modelo cargado quedan ~100 MB libres: el servidor funciona al límite, adecuado para uso ligero.
  Decisión: se mantiene t4g.small (2 GB) por el plan gratuito de AWS. Si en el futuro se sube a t4g.medium (4 GB),
  la IP pública cambia al detener la instancia: habría que asignar una Elastic IP y actualizar el DNS.
- FastAPI: un worker, pool de conexiones pequeño, cliente HTTP compartido hacia Ollama.
- Swap de 2 GB ya existente.

## 9. Estructura del repositorio

```
app/
  main.py            fábrica de la app, headers, montaje del dashboard
  config.py          todas las variables de entorno (ver .env.example)
  database.py        SQLAlchemy + fechas UTC
  api/public.py      endpoints públicos (contrato original)
  api/deps.py        autenticación por API key y por sesión
  api/admin/         auth (login, 2FA, recuperación), applications, keys, logs, usage, models, system, settings, rag, playground
  services/          ollama, api_keys, passwords, sessions, totp, mailer, rag, rate_limit, request_log, stats, system
  models/            tablas
  schemas/           validación del API de administración
  cli.py             setup-env, check-db, create-admin, reset-password, list-admins
  static/dashboard/  build del frontend (generado con npm run export:app)
frontend/            código fuente del dashboard (Next.js + TypeScript + Tailwind)
migrations/          Alembic
deploy/              servicio systemd, DEPLOY.md, nginx/, ollama/ (ajustes), auto-deploy/ (despliegue desde main)
docs/                esta documentación y PENDIENTES.md
tests/               pytest (API pública, keys, admin, CLI)
```

## 10. Ramas y despliegue

```
dev   ── aquí se trabaja (Claude, OpenCode, tú). Cada cambio llega por commit o PR.
  │
  └─ Pull Request dev → main (revisión humana + merge)
                        │
main  ─────────────────┴── lo que está en producción. El servidor sigue esta rama.
```

**Despliegue automático** (`deploy/auto-deploy/`, se instala una vez con `sudo bash deploy/auto-deploy/install.sh`):
un timer de systemd revisa `main` cada 2 minutos. Si hay commits nuevos: `git checkout`, `pip install` (solo si cambió
`requirements.txt`), `alembic upgrade head` (solo si cambió `migrations/`), reinicia `devmark-ai` y comprueba que responde.
Si no responde en 60 s vuelve a la versión anterior y no reintenta ese commit. También reaplica Nginx/Ollama si cambiaron
sus archivos. Es *pull*: GitHub no necesita llaves SSH del servidor ni puertos abiertos. Registro: `journalctl -u devmark-deploy`.

**CI** (`.github/workflows/ci.yml`): en cada push/PR ejecuta ruff, pytest (SQLite y PostgreSQL 16), migraciones
arriba/abajo, `tsc` y el build del dashboard.

Actualizar producción a mano (si el despliegue automático no está instalado):

```bash
cd ~/ai-server && git fetch -q origin main && git checkout -q -f -B main origin/main \
  && venv/bin/pip install -q -r requirements.txt && venv/bin/alembic upgrade head \
  && sudo systemctl restart devmark-ai && sleep 3 && systemctl is-active devmark-ai
```

Si cambias el frontend: `cd frontend && npm run export:app` y commitea `app/static/dashboard` (el servidor no compila Node).

## 11. Preparado para lo siguiente

- **Rate limit distribuido**: `app/services/rate_limit.py` es en memoria (un worker); se reemplaza por Postgres/Redis sin tocar endpoints.
- **RAG semántico**: añadir embeddings con pgvector a `rag_chunks` (hoy: texto completo en español).
- **Tools / function calling**: tabla `tools` por aplicación y ejecución en `app/services/`.
- **Streaming (SSE)**: `stream: true` hoy devuelve la respuesta completa.
