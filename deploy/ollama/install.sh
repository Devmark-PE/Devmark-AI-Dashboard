#!/usr/bin/env bash
# Devmark AI - aplica los ajustes de Ollama y precarga el modelo por defecto.
#   sudo bash deploy/ollama/install.sh
# No cambia el modelo ni reinstala Ollama. Para deshacer:
#   sudo rm /etc/systemd/system/ollama.service.d/devmark.conf && sudo systemctl daemon-reload && sudo systemctl restart ollama
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODEL="${MODEL:-llama3.2:1b}"

install -d /etc/systemd/system/ollama.service.d
install -m 644 "$SRC/devmark.conf" /etc/systemd/system/ollama.service.d/devmark.conf
systemctl daemon-reload
# devmark-ai.service depende de ollama (Requires=), así que se reinicia con él (unos segundos).
systemctl restart ollama
for i in $(seq 1 30); do curl -sf http://127.0.0.1:11434/api/version >/dev/null && break; sleep 1; done

echo "Precargando $MODEL…"
curl -s http://127.0.0.1:11434/api/generate -d "{\"model\":\"$MODEL\",\"keep_alive\":\"24h\"}" >/dev/null
systemctl show ollama -p Environment | tr ' ' '\n' | grep OLLAMA_
ollama ps
free -h
