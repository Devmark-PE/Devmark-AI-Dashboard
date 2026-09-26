# Despliegue de Devmark AI en el EC2 (con Supabase como base de datos)

Resultado final:

```
Internet ── Nginx (HTTPS) ── FastAPI :8000 ─┬─ Ollama 127.0.0.1:11434
                                            └─ Supabase Postgres (pooler, SSL)
https://ai.devmarkpe.com/v1/...        API pública (igual que antes)
https://ai.devmarkpe.com/dashboard/    Dashboard (servido por FastAPI, sin Node en el servidor)
```

No se cambia: DNS, dominio, Nginx, Ollama, el modelo, el servicio `devmark-ai.service`
ni los endpoints actuales. La key del `.env` (`DEVmark_API_KEY`) sigue funcionando.

---

## Paso 0 — Supabase (consola web, no en el servidor)

1. **Cambia la contraseña de la base de datos** (la anterior se compartió en un chat):
   Project Settings → Database → *Reset database password*. Guárdala en tu gestor de contraseñas.
2. **Desactiva las API keys legacy** (`anon` y `service_role` en formato JWT; la `service_role` se compartió):
   Project Settings → API Keys → *Legacy API keys* → **Disable**.
   Devmark AI no usa ninguna key de Supabase: solo la conexión directa a Postgres.
3. **Región**: Project Settings → General. Lo ideal es `us-east-1` (la misma que el EC2).
   En otra región cada validación de API key suma latencia de red.
4. Botón **Connect** (arriba) → pestaña **Session pooler**. Anota: host
   (`aws-0-<región>.pooler.supabase.com`), puerto `5432`, usuario (`postgres.<ref-del-proyecto>`)
   y base `postgres`. No uses la "Direct connection": es solo IPv6 y el EC2 no tiene IPv6.

> Plan gratuito de Supabase: los proyectos se pausan tras 7 días sin actividad. Si se pausa,
> las API keys nuevas devuelven 503 (la key del `.env` sigue funcionando). Reactívalo desde la consola.

## Paso 1 — Respaldo (servidor AWS / SSH)

```bash
cp -a ~/ai-server ~/ai-server-backup-$(date +%F-%H%M) && ls -d ~/ai-server-backup-*
```

## Paso 2 — Traer el código del repo (servidor AWS / SSH)

Convierte `~/ai-server` en una copia del repositorio. `.env` y `venv/` no se tocan (están en `.gitignore`).

```bash
cd ~/ai-server
git init -q
git remote add origin https://github.com/Devmark-PE/Devmark-AI-Dashboard.git
git fetch -q origin main
git checkout -f -B main origin/main
git log --oneline -1 && ls
```

Esperado: aparecen `app/`, `migrations/`, `main.py`… y siguen `.env` y `venv/`.

## Paso 3 — Dependencias nuevas (servidor AWS / SSH)

```bash
~/ai-server/venv/bin/pip install -r ~/ai-server/requirements.txt
```

## Paso 4 — Configurar la base de datos en `.env` (servidor AWS / SSH)

El asistente pide los datos del Session pooler, **la contraseña sin mostrarla**, prueba la conexión
y añade `DATABASE_URL` y `API_KEY_PEPPER` al `.env` (permisos 600):

```bash
cd ~/ai-server && venv/bin/python -m app.cli setup-env
```

Esperado: `OK: PostgreSQL 17...` y `Añadido a .env: DATABASE_URL, API_KEY_PEPPER`.

**Copia de seguridad del pepper** (fuera del servidor, p. ej. en tu gestor de contraseñas):
```bash
grep ^API_KEY_PEPPER ~/ai-server/.env
```

## Paso 5 — Crear las tablas (servidor AWS / SSH)

```bash
cd ~/ai-server && venv/bin/alembic upgrade head
```

Esperado: `Running upgrade  -> 0001` y `0001 -> 0002`. La migración 0002 activa RLS y revoca el acceso
de `anon`/`authenticated`, así las tablas **no quedan expuestas** por la API REST de Supabase.

## Paso 6 — Crear tu usuario administrador (servidor AWS / SSH)

```bash
cd ~/ai-server && venv/bin/python -m app.cli create-admin --email TU_EMAIL --name "Jaime Tarazona"
```

Pide la contraseña (mínimo 12 caracteres) sin mostrarla.

## Paso 7 — Reiniciar el servicio (servidor AWS / SSH)

```bash
sudo systemctl restart devmark-ai && sleep 3 && systemctl is-active devmark-ai
journalctl -u devmark-ai -n 20 --no-pager
```

Esperado: `active` y en el log `Application startup complete`.

## Paso 8 — Verificar

```bash
D=https://ai.devmarkpe.com
curl -s $D/ ; echo
curl -s $D/health ; echo                                   # {"status":"healthy","ollama":"connected"}
curl -s -o /dev/null -w "docs %{http_code}\n" $D/docs      # 404
curl -s -o /dev/null -w "dashboard %{http_code}\n" $D/dashboard/   # 200
curl -s -H "Authorization: Bearer $(grep ^DEVmark_API_KEY ~/ai-server/.env | cut -d= -f2-)" $D/v1/models ; echo
```

Luego abre **https://ai.devmarkpe.com/dashboard/**, entra con tu usuario y:
1. Aplicaciones → crea tus aplicaciones (Devmark Web, DentalSoft…).
2. API Keys → crea una key por aplicación y guárdala (solo se muestra una vez).
3. Prueba la key nueva con el ejemplo cURL de Documentación.

## Después: retirar la key heredada

Cuando todos tus clientes usen keys `dmk_live_…`:

```bash
echo "LEGACY_API_KEY_ENABLED=false" >> ~/ai-server/.env && sudo systemctl restart devmark-ai
```


## Actualizar a una versión nueva

```bash
cd ~/ai-server && git fetch -q origin main && git checkout -f -B main origin/main \
  && venv/bin/pip install -q -r requirements.txt && venv/bin/alembic upgrade head && sudo systemctl restart devmark-ai
```

## Rollback (volver a la versión original)

```bash
sudo systemctl stop devmark-ai
cd ~/ai-server && git checkout -f 6e2ba16      # main.py original, sin app/
sudo systemctl start devmark-ai
```

El `.env` es compatible con ambas versiones (la original ignora las variables nuevas).
Respaldo completo en `~/ai-server-backup-*`.
