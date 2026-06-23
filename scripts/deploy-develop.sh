#!/usr/bin/env bash
# Deploy do front Pazini no servidor (develop → produção).
# Teste pipeline CI/CD — commit inofensivo para validar PR → merge → deploy.
# Chamado pelo GitHub Actions após git pull em /root/docker/orcamentopazini.
#
# Pré-requisitos no servidor:
#   - Docker
#   - front/.env com credenciais de produção (não versionado)
#   - Volume de uploads em PAZINI_UPLOADS_DIR

set -euo pipefail

REPO_DIR="${DEPLOY_REPO_PATH:-/root/docker/orcamentopazini}"
FRONT_DIR="$REPO_DIR/front"
UPLOADS_DIR="${PAZINI_UPLOADS_DIR:-/root/docker/pazini-uploads}"
CONTAINER_NAME="${PAZINI_CONTAINER_NAME:-pazini-next}"
BUN_IMAGE="${PAZINI_BUN_IMAGE:-oven/bun:1}"
APP_PORT="${PAZINI_APP_PORT:-3001}"

echo "=============================================="
echo "  PAZINI — deploy develop"
echo "=============================================="
echo "  Repo:      $REPO_DIR"
echo "  Front:     $FRONT_DIR"
echo "  Uploads:   $UPLOADS_DIR"
echo "  Container: $CONTAINER_NAME"
echo "  Porta:     $APP_PORT"
echo ""

if [ ! -f "$FRONT_DIR/.env" ]; then
  echo "[ERRO] $FRONT_DIR/.env não encontrado. Crie o .env de produção no servidor."
  exit 1
fi

mkdir -p "$UPLOADS_DIR"

docker_bun() {
  docker run --rm \
    --network host \
    -v "$FRONT_DIR:/app" \
    -v "$UPLOADS_DIR:/app/uploads" \
    -w /app \
    "$BUN_IMAGE" \
    "$@"
}

docker_npm() {
  docker run --rm \
    --network host \
    -v "$FRONT_DIR:/app" \
    -v "$UPLOADS_DIR:/app/uploads" \
    -w /app \
    node:22-bookworm-slim \
    "$@"
}

echo "[1/4] Instalando dependências (npm ci, igual ao CI)..."
docker_npm npm ci

echo "[2/4] Build Next.js..."
docker_bun bun run build

if [ "${RUN_MIGRATIONS_ON_DEPLOY:-1}" = "1" ]; then
  echo "[3/4] Migrações (idempotentes)..."
  docker_bun bun scripts/migrate.ts scripts/run-migration-modelos-dinamicos.ts
else
  echo "[3/4] Migrações ignoradas (RUN_MIGRATIONS_ON_DEPLOY=0)"
fi

echo "[4/4] Reiniciando $CONTAINER_NAME..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true

docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  -e "PORT=$APP_PORT" \
  -e NODE_ENV=production \
  -v "$FRONT_DIR:/app" \
  -v "$UPLOADS_DIR:/app/uploads" \
  -w /app \
  "$BUN_IMAGE" \
  bun run start

echo "Aguardando health check em http://127.0.0.1:$APP_PORT ..."
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$APP_PORT/" >/dev/null 2>&1; then
    echo ""
    echo "=============================================="
    echo "  DEPLOY CONCLUÍDO"
    echo "  App respondendo na porta $APP_PORT"
    echo "=============================================="
    exit 0
  fi
  sleep 3
done

echo "[ERRO] App não respondeu após o deploy."
docker logs "$CONTAINER_NAME" --tail 40 2>&1 || true
exit 1
