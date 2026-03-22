#!/bin/bash
# Ajusta dono de /app/uploads no container (volume montado → corrige upload de imagens).
# Requer REMOTE_HOST (e opcionalmente REMOTE_USER, REMOTE_PATH, SSH_KEY) em .env.local ou .env — igual ao deploy.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -f .env.local ]; then
  # shellcheck source=/dev/null
  source .env.local
elif [ -f .env ]; then
  # shellcheck source=/dev/null
  source .env
fi

REMOTE_HOST=${REMOTE_HOST:-""}
REMOTE_USER=${REMOTE_USER:-"root"}
REMOTE_PATH=${REMOTE_PATH:-"/root/docker"}

if [ -z "$SSH_KEY" ]; then
  if [ -f "$HOME/.ssh/id_rsa" ]; then
    SSH_KEY="$HOME/.ssh/id_rsa"
  elif [ -f "$HOME/.ssh/id_ed25519" ]; then
    SSH_KEY="$HOME/.ssh/id_ed25519"
  else
    SSH_KEY="$HOME/.ssh/id_rsa"
  fi
fi

if [ -z "$REMOTE_HOST" ]; then
  echo "Defina REMOTE_HOST em front/.env.local ou front/.env (mesmo uso do deploy.sh)."
  exit 1
fi

echo "Ajustando permissões de uploads em $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH (serviço pazini-app)..."
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" \
  "cd $REMOTE_PATH && docker compose exec -u root pazini-app chown -R nextjs:nodejs /app/uploads"
echo "Concluído."
