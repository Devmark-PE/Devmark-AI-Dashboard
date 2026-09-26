#!/usr/bin/env bash
# Instala el despliegue automático (una sola vez):
#   sudo bash deploy/auto-deploy/install.sh
# Desactivar:  sudo systemctl disable --now devmark-deploy.timer
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -m 755 "$SRC/devmark-deploy.sh" /usr/local/bin/devmark-deploy
install -m 644 "$SRC/devmark-deploy.service" /etc/systemd/system/devmark-deploy.service
install -m 644 "$SRC/devmark-deploy.timer" /etc/systemd/system/devmark-deploy.timer
systemctl daemon-reload
systemctl enable --now devmark-deploy.timer
systemctl list-timers devmark-deploy.timer --no-pager
echo "OK: el servidor revisará la rama main cada 2 minutos."
echo "Ver despliegues: journalctl -u devmark-deploy -n 50 --no-pager"
