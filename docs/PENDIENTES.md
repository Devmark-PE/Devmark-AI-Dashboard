# Devmark AI — Tareas pendientes (parte humana)

Cada tarea dice **dónde** se hace, el **comando exacto** y **cómo comprobarlo**.
Orden recomendado: de arriba a abajo. Marca `[x]` al terminar.

---

## Ya hecho ✅

- [x] Auditoría del servidor (puertos, servicios, Nginx, Ollama, código).
- [x] Código del EC2 versionado en GitHub.
- [x] Backend nuevo desplegado (`~/ai-server` sigue la rama `main`).
- [x] Supabase conectado (`DATABASE_URL`, `API_KEY_PEPPER` en `.env`), tablas creadas y protegidas (migración 0002).
- [x] Usuario administrador creado; login al dashboard funcionando.
- [x] Primera aplicación y API key creadas y probadas.
- [x] Seguridad de Supabase revisada (contraseña y keys legacy).
- [x] Nginx endurecido (`deploy/nginx/install.sh`; deshacer: `sudo bash deploy/nginx/rollback.sh`).
- [x] Ollama ajustado para 2 GB (`deploy/ollama/install.sh`, contexto 2048).
- [x] `API_KEY_PEPPER` respaldado fuera del servidor.
- [x] Ubuntu actualizado y servidor reiniciado; `nginx`, `ollama` y `devmark-ai` activos.
- [x] Decisión: se mantiene **t4g.small (2 GB)** para seguir en el plan gratuito de AWS.
- [x] Endpoint `POST /chat` eliminado (no lo usaba ninguna app; la API es `/v1/chat/completions`).
- [x] CORS activo para App-testeo-APIs (`https://devmark-pe.github.io`, solo `/v1/models` y `/v1/chat/completions`; otro dominio: `CORS_ALLOWED_ORIGINS` en `.env`).

---

## 1. Desplegar esta versión (RAG, Playground, 2FA, recuperación, docs) 🟢

Tras el merge del PR `dev → main` (servidor, SSH), **una sola vez** a mano:

```bash
cd ~/ai-server && git fetch -q origin main && git checkout -q -f -B main origin/main \
  && venv/bin/pip install -q -r requirements.txt && venv/bin/alembic upgrade head \
  && sudo systemctl restart devmark-ai
venv/bin/alembic current               # debe mostrar 0004 (head)
sudo bash deploy/nginx/install.sh      # permite subir PDFs de hasta 8 MB en /api/admin/rag/
sudo bash deploy/auto-deploy/install.sh   # desde ahora, cada merge a main se despliega solo
```

Comprobar el despliegue automático: `systemctl list-timers devmark-deploy.timer` y
`journalctl -u devmark-deploy -n 30 --no-pager` (tras el próximo merge debe decir «Desplegado …»).

Luego en el dashboard:
- **Configuración → Verificación en dos pasos → Activar 2FA**: escanea el QR con Google Authenticator / Authy /
  1Password y **guarda los 10 códigos de recuperación** fuera del servidor.
- **Conocimiento (RAG)** → elige la aplicación → *Añadir documento* → *Probar búsqueda* → *Activar RAG*.

## 1b. Recuperar contraseña por email (opcional) 🟡

Sin correo configurado, «¿Olvidaste tu contraseña?» muestra el comando de rescate
(`venv/bin/python -m app.cli reset-password`). Para que envíe un enlace por email, añade al `.env` del servidor
(ver `.env.example`; con Gmail usa una *contraseña de aplicación*, no tu contraseña normal):

```bash
nano ~/ai-server/.env      # SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM
sudo systemctl restart devmark-ai
```

## 1c. Fuente de marca Braze 🟡

El nombre **DEVMARK** usa la fuente *Braze* (DawnCreative). No se incluye en el repo (licencia).
Si tu licencia permite uso web, copia `Braze.woff2` (o `Braze.otf`) en `frontend/public/fonts/`, ejecuta
`cd frontend && npm run export:app` y haz commit. Mientras no esté, se muestra con la fuente de la interfaz.

## 2. Restringir SSH en AWS 🟠 (seguridad, no bloquea el funcionamiento)

**Dónde:** consola AWS → EC2 → Security Groups → Inbound rules.

- Regla del puerto **22**: cambia el origen `0.0.0.0/0` por **My IP** (`/32`).
- Deja 80 y 443 abiertos a `0.0.0.0/0`. No abras 8000, 11434 ni 5432.
- Si tu IP cambia y pierdes acceso: EC2 → Connect → *EC2 Instance Connect* o *Session Manager* y actualiza la regla.

## 3. Migrar tus apps a keys nuevas y retirar la key antigua 🟡

1. En el dashboard → API Keys, crea una key por aplicación.
2. En cada app, reemplaza el valor de la key antigua por la nueva `dmk_live_…` (en su `.env`, nunca en el frontend).
3. Verifica en **Logs** que cada app aparece con su nombre (y ya no «Key heredada (.env)»).
4. Cuando ninguna petición use la key antigua durante unos días (servidor, SSH):
   ```bash
   echo "LEGACY_API_KEY_ENABLED=false" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
   ```

## 4. A tener en cuenta 🔵

- **Supabase plan gratuito**: se pausa tras 7 días sin actividad. Si la API recibe tráfico a diario no pasa; si se pausa, reactívalo desde la consola.
- **RAM (2 GB)**: el servidor funciona al límite con el modelo cargado. Evita instalar servicios nuevos en el EC2 (bases de datos, Node, Docker) y usa un solo modelo.

## 5. Flujo de trabajo con ramas

- Se trabaja en **`dev`**. Para publicar: GitHub → *Pull requests* → *New* → base `main` ← compare `dev` → *Create* → *Merge*.
- Después del merge, el servidor se actualiza solo en ~2 min (despliegue automático). Si una versión no arranca,
  vuelve sola a la anterior y no la reintenta hasta el siguiente commit.
- GitHub Actions (CI) comprueba cada push y PR: tests, migraciones y build del dashboard. Mergea solo con ✅.
- Nunca se sube `.env`, llaves `.pem` ni contraseñas al repositorio (el repo es **público**).
