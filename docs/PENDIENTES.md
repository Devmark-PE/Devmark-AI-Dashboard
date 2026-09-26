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
- [x] RAG, Playground, 2FA, recuperación de contraseña y documentación dinámica desplegados (migración `0004`).
- [x] Despliegue automático instalado: cada merge a `main` se publica solo en ~2 min.
- [x] **2FA activada** en la cuenta de administrador y códigos de recuperación guardados.
- [x] Fuente Braze en el nombre DEVMARK.
- [x] Correo configurado (Titan, `ai@devmarkpe.com`): recuperación de contraseña y avisos de seguridad con diseño DEVMARK.
- [x] SSH restringido en AWS (`sg-00a716674b16980a2`): puerto 22 solo desde la IP de casa + lista `ec2-instance-connect`
  (`pl-0e4bcff02b13bef1e`) para entrar desde el navegador. Si cambia tu IP: regla SSH → Origen → **Mi IP** → Guardar.
- [x] CORS activo para App-testeo-APIs (`https://devmark-pe.github.io`, solo `/v1/models` y `/v1/chat/completions`; otro dominio: `CORS_ALLOWED_ORIGINS` en `.env`).

---

## 1. Migrar tus apps a keys nuevas y retirar la key antigua 🟡

1. En el dashboard → API Keys, crea una key por aplicación.
2. En cada app, reemplaza el valor de la key antigua por la nueva `dmk_live_…` (en su `.env`, nunca en el frontend).
3. Verifica en **Logs** que cada app aparece con su nombre (y ya no «Key heredada (.env)»).
4. Cuando ninguna petición use la key antigua durante unos días (servidor, SSH):
   ```bash
   echo "LEGACY_API_KEY_ENABLED=false" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
   ```

## 2. A tener en cuenta 🔵

- **Supabase plan gratuito**: se pausa tras 7 días sin actividad. Si la API recibe tráfico a diario no pasa; si se pausa, reactívalo desde la consola.
- **IP pública automática** (`34.204.181.237`, sin IP elástica): reiniciar no la cambia, pero **detener e iniciar** la instancia sí,
  y el dominio dejaría de apuntar al servidor. Antes de detenerla: asignar una IP elástica y actualizar el DNS.
- **RAM (2 GB)**: el servidor funciona al límite con el modelo cargado. Evita instalar servicios nuevos en el EC2 (bases de datos, Node, Docker) y usa un solo modelo.

## 3. Flujo de trabajo con ramas

- Se trabaja en **`dev`**. Para publicar: GitHub → *Pull requests* → *New* → base `main` ← compare `dev` → *Create* → *Merge*.
- Después del merge, el servidor se actualiza solo en ~2 min (despliegue automático). Si una versión no arranca,
  vuelve sola a la anterior y no la reintenta hasta el siguiente commit.
- GitHub Actions (CI) comprueba cada push y PR: tests, migraciones y build del dashboard. Mergea solo con ✅.
- Nunca se sube `.env`, llaves `.pem` ni contraseñas al repositorio (el repo es **público**).
