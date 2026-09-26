#!/usr/bin/env bash
# Devmark AI - vuelve a la configuración de Nginx anterior a install.sh.
#   sudo bash deploy/nginx/rollback.sh
set -euo pipefail
BACKUP="$(ls -d /root/nginx-backup-* 2>/dev/null | sort | head -1)"
[ -n "$BACKUP" ] || { echo "No hay respaldos en /root/nginx-backup-*"; exit 1; }
echo "Restaurando el respaldo más antiguo (anterior a Devmark AI): $BACKUP"
rm -rf /etc/nginx && cp -a "$BACKUP" /etc/nginx
nginx -t && systemctl reload nginx && echo "OK: configuración original restaurada."
