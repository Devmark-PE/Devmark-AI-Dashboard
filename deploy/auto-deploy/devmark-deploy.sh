#!/usr/bin/env bash
# Devmark AI - despliegue automático desde la rama main (lo ejecuta devmark-deploy.timer cada 2 min).
#
# Si main tiene commits nuevos: actualiza el código, instala dependencias si cambiaron, aplica migraciones,
# reinicia devmark-ai y comprueba que responde. Si la comprobación falla, vuelve a la versión anterior.
# También reaplica Nginx/Ollama si cambiaron sus archivos en deploy/.
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/ai-server}"
APP_USER="${APP_USER:-ubuntu}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-devmark-ai}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/}"

exec 9>/run/devmark-deploy.lock
flock -n 9 || { echo "Otro despliegue en curso"; exit 0; }

as_app() { runuser -u "$APP_USER" -- "$@"; }
cd "$APP_DIR"

as_app git fetch -q origin "$BRANCH"
OLD=$(as_app git rev-parse HEAD)
NEW=$(as_app git rev-parse "origin/$BRANCH")
[ "$OLD" = "$NEW" ] && exit 0

echo "Nueva versión en $BRANCH: ${OLD:0:7} -> ${NEW:0:7}"
CHANGED=$(as_app git diff --name-only "$OLD" "$NEW")

healthy() {
  for _ in $(seq 1 30); do
    curl -sf -H "Accept: application/json" "$HEALTH_URL" >/dev/null && return 0
    sleep 2
  done
  return 1
}

rollback() {
  echo "ERROR: la nueva versión no responde. Volviendo a ${OLD:0:7}…"
  as_app git checkout -q -f -B "$BRANCH" "$OLD"
  systemctl restart "$SERVICE"
  healthy && echo "Rollback OK: ${OLD:0:7} en servicio" || echo "ATENCIÓN: el rollback tampoco responde; revisa journalctl -u $SERVICE"
  exit 1
}

as_app git checkout -q -f -B "$BRANCH" "$NEW"
if grep -q '^requirements.txt$' <<<"$CHANGED"; then
  echo "Instalando dependencias…"
  as_app venv/bin/pip install -q -r requirements.txt || rollback
fi
if grep -q '^migrations/' <<<"$CHANGED"; then
  echo "Aplicando migraciones…"
  as_app venv/bin/alembic upgrade head || rollback
fi

systemctl restart "$SERVICE"
healthy || rollback
echo "Desplegado ${NEW:0:7}: $(as_app git log -1 --format=%s)"

if grep -q '^deploy/nginx/' <<<"$CHANGED"; then
  echo "Actualizando Nginx…"
  bash deploy/nginx/install.sh || echo "Nginx no se actualizó (install.sh restauró la configuración anterior)"
fi
if grep -q '^deploy/ollama/' <<<"$CHANGED"; then
  echo "Actualizando ajustes de Ollama…"
  bash deploy/ollama/install.sh || echo "No se pudieron aplicar los ajustes de Ollama"
fi
