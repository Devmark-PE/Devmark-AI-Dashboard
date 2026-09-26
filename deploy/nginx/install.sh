#!/usr/bin/env bash
# Devmark AI - instala el endurecimiento de Nginx (Etapa 1).
#   sudo bash deploy/nginx/install.sh
# Hace respaldo completo de /etc/nginx, aplica los cambios, valida con `nginx -t`
# y, si algo falla, restaura el respaldo automáticamente. Es idempotente.
set -euo pipefail

NGINX_DIR="${NGINX_DIR:-/etc/nginx}"
SITE="${SITE:-$NGINX_DIR/sites-enabled/ai.devmarkpe.com}"
NGINX_TEST="${NGINX_TEST:-nginx -t}"
NGINX_RELOAD="${NGINX_RELOAD:-systemctl reload nginx}"
BACKUP_ROOT="${BACKUP_ROOT:-/root}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ -f "$SITE" ] || { echo "No existe $SITE"; exit 1; }
grep -Eq '^\s*listen 443 ssl' "$SITE" || { echo "No encuentro 'listen 443 ssl' en $SITE"; exit 1; }

BACKUP="$BACKUP_ROOT/nginx-backup-$(date +%F-%H%M%S)"
cp -a "$NGINX_DIR" "$BACKUP"
echo "Respaldo: $BACKUP"

restore() {
  echo "ERROR: restaurando configuración anterior…"
  rm -rf "$NGINX_DIR" && cp -a "$BACKUP" "$NGINX_DIR"
  echo "Restaurado. Nginx sigue con la configuración original."
  exit 1
}

install -m 644 "$SRC/devmark-limits.conf" "$NGINX_DIR/conf.d/devmark-limits.conf"
install -m 644 "$SRC/devmark-proxy.conf" "$NGINX_DIR/snippets/devmark-proxy.conf"
install -m 644 "$SRC/devmark-security.conf" "$NGINX_DIR/snippets/devmark-security.conf"
install -m 644 "$SRC/00-catchall" "$NGINX_DIR/sites-available/00-catchall"
ln -sfn "$NGINX_DIR/sites-available/00-catchall" "$NGINX_DIR/sites-enabled/00-catchall"

# El sitio "default" de Nginx competiría con el catch-all: se desactiva (queda en sites-available).
if [ -e "$NGINX_DIR/sites-enabled/default" ]; then
  rm -f "$NGINX_DIR/sites-enabled/default"
  echo "Sitio 'default' desactivado"
fi

# Ocultar la versión de Nginx.
sed -i -E 's/^(\s*)server_tokens\s+build;.*/\1server_tokens off;/' "$NGINX_DIR/nginx.conf"

# Incluir el snippet dentro del bloque HTTPS (justo antes de 'listen 443 ssl'), una sola vez.
if ! grep -q 'include snippets/devmark-security.conf;' "$SITE"; then
  sed -i -E '0,/^\s*listen 443 ssl/s//    include snippets\/devmark-security.conf;\n&/' "$SITE"
fi

if $NGINX_TEST; then
  $NGINX_RELOAD
  echo "OK: Nginx endurecido y recargado."
else
  restore
fi
