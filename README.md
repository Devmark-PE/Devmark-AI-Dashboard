# DEVmark AI

Plataforma privada de IA sobre **FastAPI + Ollama**: API compatible con OpenAI, gestión de API keys
por aplicación, logs, uso, estado del sistema y un dashboard de administración.

```
Clientes ── https://ai.devmarkpe.com/v1 ── Nginx ── FastAPI ─┬─ Ollama (127.0.0.1:11434)
Admin ───── https://ai.devmarkpe.com  (el navegador entra directo al dashboard) ─────────────┘└─ PostgreSQL / Supabase
```

## Estructura

| Ruta | Contenido |
|---|---|
| `main.py` | Punto de entrada (`uvicorn main:app`), reexporta `app.main:app` |
| `app/api/public.py` | `/`, `/health`, `/chat`, `/v1/chat/completions`, `/v1/models` (contrato original) |
| `app/api/admin/` | API del dashboard (`/api/admin/*`): auth, keys, aplicaciones, logs, uso, modelos, sistema |
| `app/services/` | Ollama, API keys (HMAC), sesiones, logs, estadísticas, comprobaciones del sistema |
| `app/models/` | Tablas: `users`, `admin_sessions`, `applications`, `api_keys`, `api_request_logs` |
| `migrations/` | Alembic (0001 esquema, 0002 bloqueo de la API REST de Supabase) |
| `frontend/` | Dashboard Next.js + TypeScript + Tailwind (export estático) |
| `app/static/dashboard/` | Build del dashboard que sirve FastAPI en `/dashboard` |
| `deploy/` | Servicio systemd, **guía de despliegue** (`deploy/DEPLOY.md`), Nginx (`deploy/nginx/`) y Ollama (`deploy/ollama/`) |
| `docs/` | **`ARQUITECTURA.md`** (cómo funciona todo) y **`PENDIENTES.md`** (tareas humanas con instrucciones) |

## Seguridad

- API keys: se muestran una sola vez; en la base solo se guarda `HMAC-SHA256(pepper, key)` y un prefijo visible.
- Dashboard: usuarios propios (contraseña con scrypt), cookie `HttpOnly; Secure; SameSite=Strict`,
  token CSRF, bloqueo tras 5 intentos fallidos. Una API key **no** da acceso al dashboard.
- Logs sin contenido de prompts/respuestas salvo `LOG_REQUEST_CONTENT=true`.
- `/docs` y `/openapi.json` desactivados (`ENABLE_DOCS=false`).
- En Supabase las tablas tienen RLS y sin privilegios para `anon`/`authenticated`.

## Desarrollo local

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                       # tests (SQLite); TEST_DATABASE_URL=postgresql+psycopg://… para PostgreSQL

cd frontend && npm install
npm run dev                            # http://localhost:3000/dashboard (proxy a FastAPI en :8000)
npm run export:app                     # build estático → app/static/dashboard
```

## Preparado para lo siguiente

- **Rate limiting / cuotas**: `rate_limit_rpm` por key y por aplicación (activo), `monthly_token_quota` (columna lista).
- **RAG**: PostgreSQL + pgvector (Supabase lo incluye) con tablas `rag_sources` / `rag_documents` por aplicación.
- **Tools / function calling**: tabla `tools` por aplicación y ejecución desde `app/services/`.
