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

## 1. Restringir SSH en AWS 🟠 (seguridad, no bloquea el funcionamiento)

**Dónde:** consola AWS → EC2 → Security Groups → Inbound rules.

- Regla del puerto **22**: cambia el origen `0.0.0.0/0` por **My IP** (`/32`).
- Deja 80 y 443 abiertos a `0.0.0.0/0`. No abras 8000, 11434 ni 5432.
- Si tu IP cambia y pierdes acceso: EC2 → Connect → *EC2 Instance Connect* o *Session Manager* y actualiza la regla.

## 2. Migrar tus apps a keys nuevas y retirar la key antigua 🟡

1. En el dashboard → API Keys, crea una key por aplicación.
2. En cada app, reemplaza el valor de la key antigua por la nueva `dmk_live_…` (en su `.env`, nunca en el frontend).
3. Verifica en **Logs** que cada app aparece con su nombre (y ya no «Key heredada (.env)»).
4. Cuando ninguna petición use la key antigua durante unos días (servidor, SSH):
   ```bash
   echo "LEGACY_API_KEY_ENABLED=false" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
   ```

## 3. A tener en cuenta 🔵

- **Supabase plan gratuito**: se pausa tras 7 días sin actividad. Si la API recibe tráfico a diario no pasa; si se pausa, reactívalo desde la consola.
- **RAM (2 GB)**: el servidor funciona al límite con el modelo cargado. Evita instalar servicios nuevos en el EC2 (bases de datos, Node, Docker) y usa un solo modelo.

## 4. Flujo de trabajo con ramas

- Se trabaja en **`dev`**. Para publicar: GitHub → *Pull requests* → *New* → base `main` ← compare `dev` → *Create* → *Merge*.
- Después del merge, actualiza el servidor con el comando de `docs/ARQUITECTURA.md` §9.
- Nunca se sube `.env`, llaves `.pem` ni contraseñas al repositorio (el repo es **público**).
