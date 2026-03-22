#!/bin/bash

set -e

# Sempre executar a partir do diretório front/ (onde está o Dockerfile)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=============================================="
echo "  PAZINI DEPLOY - Log detalhado"
echo "=============================================="
echo ""

# Load configuration (REMOTE_HOST, REMOTE_USER, REMOTE_PATH, SSH_KEY) - apenas de front/
echo "[CONFIG] Carregando variáveis de front/..."
if [ -f .env.local ]; then
  echo "  -> Usando front/.env.local"
  source .env.local
elif [ -f .env ]; then
  echo "  -> Usando front/.env"
  source .env
else
  echo "  -> Nenhum arquivo de config encontrado em front/"
fi

REMOTE_HOST=${REMOTE_HOST:-""}
REMOTE_USER=${REMOTE_USER:-"root"}
REMOTE_PATH=${REMOTE_PATH:-"/root/docker"}

# Usar id_ed25519 se id_rsa não existir
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
  echo ""
  echo "[ERRO] REMOTE_HOST não definido (configure em .env.local ou .env)."
  exit 1
fi

echo ""
echo "[CONEXÃO] Destino do deploy:"
echo "  Host:    $REMOTE_HOST"
echo "  Usuário: $REMOTE_USER"
echo "  Caminho: $REMOTE_PATH"
echo "  SSH Key: $SSH_KEY"
echo "  Comando: ssh $REMOTE_USER@$REMOTE_HOST"
echo ""

# 1. Build local para linux/amd64 (VPS típica; evita "exec format error" ao rodar em x86)
echo "[1/6] Building imagem localmente para linux/amd64 (contexto: $SCRIPT_DIR)..."
docker build --platform linux/amd64 -t pazini-app:latest .
echo "  OK - Imagem pazini-app:latest criada"
echo ""

# 2. Salvar imagem
echo "[2/6] Salvando imagem em arquivo tar.gz..."
TAR_FILE="/tmp/pazini-app-$$.tar.gz"
docker save pazini-app:latest | gzip > "$TAR_FILE"
TAR_SIZE=$(du -h "$TAR_FILE" | cut -f1)
echo "  OK - Arquivo: $TAR_FILE ($TAR_SIZE)"
echo ""

# 3. Criar diretório remoto e subpasta pazini
echo "[3/6] Criando diretórios remotos via SSH..."
echo "  Executando: ssh $REMOTE_USER@$REMOTE_HOST \"mkdir -p $REMOTE_PATH/pazini\""
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p $REMOTE_PATH/pazini"
echo "  OK - Diretórios $REMOTE_PATH e $REMOTE_PATH/pazini criados/verificados"
echo ""

# 4. Upload .env.production para /root/docker/pazini
echo "[4/6] Enviando .env.production..."
if [ -f .env.production ]; then
    echo "  De: $(pwd)/.env.production"
    echo "  Para: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/pazini/.env.production"
    scp -i "$SSH_KEY" .env.production "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/pazini/.env.production"
    echo "  OK - .env.production enviado"
else
    echo "  AVISO - .env.production não encontrado em front/!"
fi
echo ""

# 5. Transferir imagem para servidor
echo "[5/6] Transferindo imagem para servidor..."
echo "  De: $TAR_FILE"
echo "  Para: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/pazini-app.tar.gz"
scp -i "$SSH_KEY" "$TAR_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/pazini-app.tar.gz"
rm -f "$TAR_FILE"
echo "  OK - Imagem transferida (arquivo local removido)"
echo ""

# 6. Load imagem e subir containers (usa docker-compose existente em /root/docker)
echo "[6/6] No servidor: carregar imagem e subir containers..."
echo "  Executando em $REMOTE_USER@$REMOTE_HOST:"
echo "    cd $REMOTE_PATH"
echo "    docker load < pazini-app.tar.gz"
echo "    rm -f pazini-app.tar.gz"
echo "    docker rm -f pazini-app || true"
echo "    docker compose up -d --force-recreate"
echo "    docker compose exec -u root pazini-app chown -R nextjs:nodejs /app/uploads (permissões do volume de uploads)"
echo ""
ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" "cd $REMOTE_PATH && docker load < pazini-app.tar.gz && rm -f pazini-app.tar.gz && docker rm -f pazini-app || true && docker compose up -d --force-recreate && (docker compose exec -u root pazini-app chown -R nextjs:nodejs /app/uploads || true) && docker image prune -f"

echo ""
echo "=============================================="
echo "  DEPLOY CONCLUÍDO COM SUCESSO"
echo "=============================================="
echo "  App disponível em: http://$REMOTE_HOST:3001"
echo ""
