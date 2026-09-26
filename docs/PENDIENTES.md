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
- [x] Nginx endurecido (`deploy/nginx/install.sh`).
- [x] Ollama ajustado para 2 GB (`deploy/ollama/install.sh`, contexto 2048).

---

## 1. Guardar el pepper fuera del servidor 🔴

**Dónde:** servidor (SSH). Copia el valor a tu gestor de contraseñas. No lo pegues en chats.

```bash
grep ^API_KEY_PEPPER ~/ai-server/.env
```

Si se pierde, todas las API keys dejan de funcionar y habría que crearlas de nuevo.

## 2. Endurecer Nginx (Etapa 1) 🟠

**Dónde:** servidor (SSH). Hace respaldo de `/etc/nginx`, aplica, valida y **se restaura solo si algo falla**.

```bash
cd ~/ai-server && git pull -q origin main && sudo bash deploy/nginx/install.sh
```

Aplica: límites por IP (`/v1` 20/min, `/chat` 6/min, login 10/min), headers de seguridad, `/docs` cerrado,
rechazo de peticiones por IP o dominios desconocidos, versión de Nginx oculta.

**Comprobar** (desde tu PC o el servidor):
```bash
D=https://ai.devmarkpe.com
for u in / /health /docs /dashboard/; do echo "$u -> $(curl -s -o /dev/null -w '%{http_code}' $D$u)"; done
curl -sI $D/health | grep -iE "strict-transport|x-frame|^server"
```
Esperado: `/ 200`, `/health 200`, `/docs 404`, `/dashboard/ 200`, headers presentes, `Server: nginx` sin versión.

**Deshacer:** `sudo bash ~/ai-server/deploy/nginx/rollback.sh`

> Si una app tuya llama a la API desde un servidor con muchos usuarios (todos salen por la misma IP) y ves
> errores 429, sube el límite en `deploy/nginx/devmark-limits.conf` (`rate=20r/m`) y vuelve a instalar.

## 3. Ajustar Ollama para 2 GB 🟠

**Dónde:** servidor (SSH). Un modelo cargado, una generación a la vez, modelo siempre en memoria (sin arranques en frío de ~30 s). No cambia el modelo.

```bash
cd ~/ai-server && sudo bash deploy/ollama/install.sh
```

**Comprobar:** la salida muestra `OLLAMA_KEEP_ALIVE=24h` y `ollama ps` lista `llama3.2:1b`. En el dashboard → Modelos, «En memoria: Sí».

**Deshacer:**
```bash
sudo rm /etc/systemd/system/ollama.service.d/devmark.conf && sudo systemctl daemon-reload && sudo systemctl restart ollama
```

## 4. Actualizar Ubuntu 🟠

**Dónde:** servidor (SSH). Hay ~139 actualizaciones de seguridad. Elige un momento con poco tráfico (reinicio de ~1 min).

```bash
sudo apt update && sudo apt -y upgrade
[ -f /var/run/reboot-required ] && sudo reboot
```

**Comprobar** (tras reconectar por SSH): `systemctl is-active nginx ollama devmark-ai` → `active` ×3.

## 5. Restringir SSH en AWS 🟠

**Dónde:** consola AWS → EC2 → Security Groups → Inbound rules.

- Regla del puerto **22**: cambia el origen `0.0.0.0/0` por **My IP** (`/32`).
- Deja 80 y 443 abiertos a `0.0.0.0/0`. No abras 8000, 11434 ni 5432.
- Si tu IP cambia y pierdes acceso: EC2 → Connect → *EC2 Instance Connect* o *Session Manager* y actualiza la regla.

## 6. Migrar tus apps a keys nuevas y retirar la key antigua 🟡

1. En el dashboard → API Keys, crea una key por aplicación.
2. En cada app, reemplaza el valor de la key antigua por la nueva `dmk_live_…` (en su `.env`, nunca en el frontend).
3. Verifica en **Logs** que cada app aparece con su nombre (y ya no «Key heredada (.env)»).
4. Cuando ninguna petición use la key antigua durante unos días (servidor, SSH):
   ```bash
   echo "LEGACY_API_KEY_ENABLED=false" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
   ```

## 7. Proteger `/chat` 🟡

**Comprobar si alguien lo usa** (dashboard → Logs → filtro endpoint `/chat`, o SSH):
```bash
sudo zgrep -h '"POST /chat' /var/log/nginx/access.log* | awk '{print $1, $9}' | sort | uniq -c | sort -rn | head
```
Si no hay ninguna app tuya (solo bots o nada):
```bash
echo "CHAT_REQUIRE_API_KEY=true" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
```
**Comprobar:** `curl -s -X POST https://ai.devmarkpe.com/chat -H 'Content-Type: application/json' -d '{"message":"hola"}'` → `{"detail":"API key requerida"}`.

## 8. Decisiones pendientes 🔵

- **RAM**: seguir en t4g.small (2 GB) o subir a t4g.medium (4 GB, ~12 USD/mes más).
  Antes de cambiar el tipo de instancia hay que asignar una **Elastic IP** a `34.204.181.237` (EC2 → Elastic IPs); si no, la IP cambia y el DNS deja de apuntar.
- **Supabase plan gratuito**: se pausa tras 7 días sin actividad. Si la API recibe tráfico a diario no pasa; si se pausa, reactívalo desde la consola.

## 9. Flujo de trabajo con ramas

- Se trabaja en **`dev`**. Para publicar: GitHub → *Pull requests* → *New* → base `main` ← compare `dev` → *Create* → *Merge*.
- Después del merge, actualiza el servidor con el comando de `docs/ARQUITECTURA.md` §9.
- Nunca se sube `.env`, llaves `.pem` ni contraseñas al repositorio (el repo es **público**).
