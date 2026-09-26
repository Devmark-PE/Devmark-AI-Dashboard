# DEVMARK AI

[![CI](https://github.com/Devmark-PE/Devmark-AI-Dashboard/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Devmark-PE/Devmark-AI-Dashboard/actions/workflows/ci.yml)

Plataforma privada de IA de Devmark sobre **FastAPI + Ollama**, en producción en **https://ai.devmarkpe.com**.
API compatible con OpenAI para las aplicaciones de la empresa y una consola web para administrarla:
API keys por aplicación, conocimiento propio (RAG), Playground, uso, logs, estado del sistema y documentación.

```
Apps (API key) ── https://ai.devmarkpe.com/v1 ──┐
                                                 ├─ Nginx (TLS, límites) ── FastAPI :8000 ─┬─ Ollama :11434 (llama3.2:1b)
Admin (navegador) ── https://ai.devmarkpe.com ──┘                                          └─ Supabase PostgreSQL
```

El servidor es un EC2 **t4g.small** (ARM64, 2 GB). Solo 80/443 (y SSH restringido) están abiertos: FastAPI, Ollama y la base de datos no son accesibles desde Internet.

## Qué incluye

| Módulo | Qué hace |
|---|---|
| **API pública** | `POST /v1/chat/completions` y `GET /v1/models` (formato OpenAI), `/status`, `/health` |
| **API keys** | `dmk_live_…` / `dmk_test_…` por aplicación; se muestran una vez, se guarda solo el hash; permisos, límite por minuto, expiración, revocar y regenerar con periodo de gracia |
| **Aplicaciones** | Agrupan keys; deshabilitar una app bloquea todas sus keys |
| **Conocimiento (RAG)** | Documentos por aplicación (texto, .md, .txt, .pdf) con búsqueda de texto completo en español; se aplica automáticamente a las keys de esa app y devuelve las fuentes usadas |
| **Playground** | Chat con el modelo desde el dashboard (sin API key), con o sin documentos |
| **Uso y Logs** | Peticiones, tokens, latencia y errores por app/key/modelo, sin guardar prompts ni respuestas |
| **Sistema** | Estado de Ollama, Nginx, base de datos, RAM y disco |
| **Documentación** | Guía dinámica dentro del dashboard: ejemplos en cURL/JS/Python/SDK de OpenAI y consola «Probar ahora» |
| **Seguridad del admin** | Login con **2FA (TOTP)** y códigos de recuperación, recuperar contraseña por email, «mantener sesión», avisos de seguridad por correo |

## Uso rápido de la API

```bash
curl https://ai.devmarkpe.com/v1/chat/completions \
  -H "Authorization: Bearer $DEVMARK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.2:1b","messages":[{"role":"user","content":"Hola"}]}'
```

Compatible con los SDK de OpenAI cambiando `base_url` a `https://ai.devmarkpe.com/v1`.
La key va solo en el backend de cada app (nunca en el frontend). Más ejemplos: dashboard → **Documentación**.

## Despliegue

- **Ramas:** se trabaja en `dev`; producción es `main`. Todo cambio llega por Pull Request `dev → main`.
- **CI** (GitHub Actions): ruff, pytest en SQLite y PostgreSQL, migraciones arriba/abajo, `tsc` y build del dashboard.
- **Despliegue automático:** el servidor revisa `main` cada 2 minutos; instala dependencias y aplica migraciones solo si
  cambiaron, reinicia y comprueba que responde. Si la versión nueva falla, **vuelve sola a la anterior**.
  Registro: `journalctl -u devmark-deploy -n 30 --no-pager`.

Instalación inicial y comandos manuales: [`deploy/DEPLOY.md`](deploy/DEPLOY.md).

## Estructura

| Ruta | Contenido |
|---|---|
| `main.py` | Punto de entrada (`uvicorn main:app`) |
| `app/api/public.py` | `/`, `/status`, `/health`, `/v1/chat/completions`, `/v1/models` |
| `app/api/admin/` | API del dashboard (`/api/admin/*`): auth y 2FA, aplicaciones, keys, RAG, playground, logs, uso, modelos, sistema, configuración |
| `app/services/` | Ollama, API keys (HMAC), sesiones, TOTP, correo y plantillas, RAG, límites, logs, estadísticas |
| `app/models/` | Tablas (usuarios, sesiones, aplicaciones, keys, logs, RAG, tokens de recuperación) |
| `migrations/` | Alembic: `0001` esquema · `0002` bloqueo de la API REST de Supabase · `0003` RAG · `0004` 2FA y recuperación |
| `frontend/` | Dashboard Next.js + TypeScript + Tailwind (export estático, fuente de marca Braze) |
| `app/static/dashboard/` | Build del dashboard que sirve FastAPI en `/dashboard` |
| `deploy/` | Servicio systemd, `DEPLOY.md`, Nginx, ajustes de Ollama y despliegue automático |
| `docs/` | [`ARQUITECTURA.md`](docs/ARQUITECTURA.md) (cómo funciona todo) y [`PENDIENTES.md`](docs/PENDIENTES.md) (estado y tareas) |
| `tests/` | pytest: API pública, keys, admin, RAG, 2FA, recuperación, correos, CLI |

## Seguridad

- **API keys:** solo se guarda `HMAC-SHA256(pepper, key)` y un prefijo visible; una API key **no** da acceso al dashboard.
- **Dashboard:** contraseñas con scrypt, cookie `HttpOnly; Secure; SameSite=Strict`, CSRF, bloqueo tras 5 intentos,
  2FA con protección contra reutilización y códigos de recuperación de un solo uso (hash).
- **Privacidad:** los logs no guardan prompts ni respuestas (`LOG_REQUEST_CONTENT=false`); los correos nunca incluyen secretos.
- **Infraestructura:** Nginx con HTTPS, límites por IP y cabeceras de seguridad; `/docs` y `/openapi.json` desactivados;
  Ollama y FastAPI solo en `127.0.0.1`; tablas de Supabase con RLS y sin acceso para `anon`/`authenticated`.
- **Repositorio público:** nunca se suben `.env`, llaves `.pem` ni contraseñas (ver `.gitignore`).

## Administración (servidor)

```bash
venv/bin/python -m app.cli create-admin      # crear administrador
venv/bin/python -m app.cli reset-password    # restablecer contraseña sin email
venv/bin/python -m app.cli list-admins
venv/bin/python -m app.cli check-db          # probar la conexión a la base de datos
```

Variables de entorno: [`.env.example`](.env.example) (base de datos, pepper de keys, modelos, CORS, sesión, SMTP).

## Desarrollo local

```bash
python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest                       # SQLite; TEST_DATABASE_URL=postgresql+psycopg://… para PostgreSQL
.venv/bin/ruff check .

cd frontend && npm install
npm run dev                            # http://localhost:3000/dashboard (proxy a FastAPI en :8000)
npm run export:app                     # build estático → app/static/dashboard (commitear el resultado)
```

## Siguientes pasos

- **Instrucciones y límites por aplicación** (system prompt y `max_tokens` guardados por app).
- **Tools / function calling** para que la IA consulte sistemas de la empresa.
- **Portal de clientes y cuotas** si la API se ofrece a terceros.
- **RAG semántico** con pgvector (requiere más RAM para un modelo de embeddings).
