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
- [x] Keys de prueba eliminadas; las apps nuevas usarán keys `dmk_…` por aplicación.
- [x] CORS activo para App-testeo-APIs (`https://devmark-pe.github.io`, solo `/v1/models` y `/v1/chat/completions`; otro dominio: `CORS_ALLOWED_ORIGINS` en `.env`).

---

## 1. Primera herramienta (Tools) 🟢

Tras el merge se despliega solo (instala `cryptography` y aplica la migración `0005`). Luego, en el dashboard:

1. **Herramientas → Nueva herramienta → Tabla de Supabase**.
2. URL: cambia `TU-PROYECTO` y `leads` por tu proyecto y tabla; ajusta las columnas de `select=` y los filtros.
3. Cabecera `apikey`: la key **publishable/anon** de ese proyecto (Supabase → Project Settings → API Keys) y, en esa tabla,
   una política RLS que permita solo `select`. Así la herramienta puede leer pero nunca modificar. (La key `secret`/`service_role`
   también funciona, pero da acceso total: úsala solo si entiendes el riesgo; igual queda cifrada en el servidor.)
4. Marca la aplicación que la usará → **Crear** → **Probar** con un nombre real.
5. **Playground** → elige la aplicación → «Usar herramientas» → pregunta, por ejemplo, «¿Qué sabes del lead Ana?».

## 2. Al conectar una app nueva 🟢

1. Dashboard → **Aplicaciones** → crea la app → **API Keys** → crea su key (`dmk_live_…`; `dmk_test_…` para pruebas).
2. Guarda la key en el backend de la app (su `.env`), nunca en el frontend.
3. Comprueba en **Logs** que las peticiones aparecen con el nombre de la app.

## 3. A tener en cuenta 🔵

- **Modo reposo**: en el Dashboard, **Pausar IA** libera la RAM del modelo cuando no se usa; **Activar IA** lo vuelve a
  cargar en segundos. Mientras está en pausa, las apps reciben `503 ai_paused`. No apagues el servidor en AWS para esto.

- **Supabase plan gratuito**: se pausa tras 7 días sin actividad. Si la API recibe tráfico a diario no pasa; si se pausa, reactívalo desde la consola.
- **IP pública automática** (`34.204.181.237`, sin IP elástica): reiniciar no la cambia, pero **detener e iniciar** la instancia sí,
  y el dominio dejaría de apuntar al servidor. Antes de detenerla: asignar una IP elástica y actualizar el DNS.
- **RAM (2 GB)**: el servidor funciona al límite con el modelo cargado. Evita instalar servicios nuevos en el EC2 (bases de datos, Node, Docker) y usa un solo modelo.

## 4. Flujo de trabajo con ramas

- Se trabaja en **`dev`**. Para publicar: GitHub → *Pull requests* → *New* → base `main` ← compare `dev` → *Create* → *Merge*.
- Después del merge, el servidor se actualiza solo en ~2 min (despliegue automático). Si una versión no arranca,
  vuelve sola a la anterior y no la reintenta hasta el siguiente commit.
- GitHub Actions (CI) comprueba cada push y PR: tests, migraciones y build del dashboard. Mergea solo con ✅.
- Nunca se sube `.env`, llaves `.pem` ni contraseñas al repositorio (el repo es **público**).
