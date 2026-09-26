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
| `POST /chat` | Público (hasta activar `CHAT_REQUIRE_API_KEY=true`) | Endpoint original simple |
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
- Cada key pertenece a una **aplicación**; deshabilitar la aplicación bloquea todas sus keys (403).

## 5. Dashboard y seguridad del administrador

- Usuarios propios en la tabla `users` (contraseña con **scrypt**). Se crean por CLI: `python -m app.cli create-admin`.
- Login → cookie `dmk_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, 12 h). En la base solo se guarda el hash del token.
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
| `api_request_logs` | Una fila por request: app, key, endpoint, modelo, tokens, tiempo, estado, error |

- Migraciones con **Alembic** (`migrations/`). `0002` activa RLS y revoca `anon`/`authenticated`: la API REST pública de Supabase no puede leer estas tablas.
- Conexión por **Session pooler** (IPv4) con `sslmode=require`. El backend no usa ninguna key de Supabase.

## 7. Ajustes para 2 GB de RAM

- Sin PostgreSQL ni Node en el servidor (Supabase + dashboard estático).
- Ollama (drop-in `deploy/ollama/devmark.conf`): 1 modelo cargado, 1 generación a la vez, modelo en memoria 24 h.
- FastAPI: un worker, pool de conexiones pequeño, cliente HTTP compartido hacia Ollama.
- Swap de 2 GB ya existente.

## 8. Estructura del repositorio

```
app/
  main.py            fábrica de la app, headers, montaje del dashboard
  config.py          todas las variables de entorno (ver .env.example)
  database.py        SQLAlchemy + fechas UTC
  api/public.py      endpoints públicos (contrato original)
  api/deps.py        autenticación por API key y por sesión
  api/admin/         auth, applications, keys, logs, usage, models, system, settings, overview
  services/          ollama, api_keys, passwords, sessions, rate_limit, request_log, stats, system
  models/            tablas
  schemas/           validación del API de administración
  cli.py             setup-env, check-db, create-admin, reset-password, list-admins
  static/dashboard/  build del frontend (generado con npm run export:app)
frontend/            código fuente del dashboard (Next.js + TypeScript + Tailwind)
migrations/          Alembic
deploy/              servicio systemd, DEPLOY.md, nginx/ (Etapa 1), ollama/ (ajustes)
docs/                esta documentación y PENDIENTES.md
tests/               pytest (API pública, keys, admin, CLI)
```

## 9. Ramas y despliegue

```
dev   ── aquí se trabaja (Claude, OpenCode, tú). Cada cambio llega por commit o PR.
  │
  └─ Pull Request dev → main (revisión humana + merge)
                        │
main  ─────────────────┴── lo que está en producción. El servidor sigue esta rama.
```

Actualizar producción después de un merge a `main` (servidor, SSH):

```bash
cd ~/ai-server && git fetch -q origin main && git checkout -q -f -B main origin/main \
  && venv/bin/pip install -q -r requirements.txt && venv/bin/alembic upgrade head \
  && sudo systemctl restart devmark-ai && sleep 3 && systemctl is-active devmark-ai
```

Si cambias el frontend: `cd frontend && npm run export:app` y commitea `app/static/dashboard` (el servidor no compila Node).

## 10. Preparado para lo siguiente

- **Cuotas**: `monthly_token_quota` por aplicación ya existe en la tabla; falta aplicarla en `authenticate`.
- **Rate limit distribuido**: `app/services/rate_limit.py` es en memoria (un worker); se reemplaza por Postgres/Redis sin tocar endpoints.
- **RAG**: pgvector en Supabase; tablas `rag_sources` / `rag_documents` por `application_id`.
- **Tools / function calling**: tabla `tools` por aplicación y ejecución en `app/services/`.
- **Streaming (SSE)**: `stream: true` hoy devuelve la respuesta completa.
