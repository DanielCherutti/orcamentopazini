#!/bin/bash
# db-backup.sh — Backup e restauração do SurrealDB remoto do Pazini
#
# Uso:
#   ./db-backup.sh backup              # exporta DB remoto e baixa para ./backups/
#   ./db-backup.sh backup-full         # backup DB + uploads
#   ./db-backup.sh restore <arquivo>   # restaura .surql para o DB remoto
#   ./db-backup.sh restore-full <dir>  # restaura DB + uploads de um diretório de backup-full
#   ./db-backup.sh list                # lista backups locais disponíveis

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Configuração ─────────────────────────────────────────────────────────────
# Mesma fonte do deploy.sh
if [ -f "$SCRIPT_DIR/front/.env.local" ]; then
    source "$SCRIPT_DIR/front/.env.local"
elif [ -f "$SCRIPT_DIR/front/.env" ]; then
    source "$SCRIPT_DIR/front/.env"
fi

REMOTE_HOST=${REMOTE_HOST:-""}
REMOTE_USER=${REMOTE_USER:-"root"}
REMOTE_PATH=${REMOTE_PATH:-"/root/docker"}

if [ -z "$SSH_KEY" ]; then
    if [ -f "$HOME/.ssh/id_ed25519" ]; then
        SSH_KEY="$HOME/.ssh/id_ed25519"
    elif [ -f "$HOME/.ssh/id_rsa" ]; then
        SSH_KEY="$HOME/.ssh/id_rsa"
    fi
fi

# SurrealDB
SURREAL_CONTAINER=${SURREAL_CONTAINER:-"surrealdb"}
SURREAL_HOST=${SURREAL_HOST:-"ws://localhost:8000"}
SURREAL_USER=${SURREAL_USER:-"admin"}
SURREAL_PASS=${SURREAL_PASS:-"q1w2e3r4"}
SURREAL_NS=${SURREAL_NS:-"pazini"}
SURREAL_DB=${SURREAL_DB:-"core"}

# Pasta de uploads no servidor (relativa a REMOTE_PATH)
REMOTE_UPLOADS="${REMOTE_PATH}/pazini-uploads"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOCAL_BACKUPS="$SCRIPT_DIR/backups"

# ── Helpers ───────────────────────────────────────────────────────────────────
check_remote() {
    if [ -z "$REMOTE_HOST" ]; then
        echo "[ERRO] REMOTE_HOST não definido — configure em front/.env.local"
        exit 1
    fi
}

ssh_exec() {
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "$@"
}

scp_get() {
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST:$1" "$2"
}

scp_put() {
    scp -i "$SSH_KEY" -o StrictHostKeyChecking=no "$1" "$REMOTE_USER@$REMOTE_HOST:$2"
}

header() {
    echo ""
    echo "======================================================"
    echo "  $1"
    echo "======================================================"
    echo "  Servidor : $REMOTE_USER@$REMOTE_HOST"
    echo ""
}

# ── Comandos ─────────────────────────────────────────────────────────────────

do_backup() {
    check_remote
    mkdir -p "$LOCAL_BACKUPS"

    REMOTE_TMP="/tmp/pazini-db-$TIMESTAMP.surql"
    LOCAL_FILE="$LOCAL_BACKUPS/pazini-db-$TIMESTAMP.surql"

    header "BACKUP DB"
    echo "  Destino  : $LOCAL_FILE"
    echo ""

    echo "[1/3] Exportando banco (surreal export no container $SURREAL_CONTAINER)..."
    ssh_exec "docker exec $SURREAL_CONTAINER surreal export \
        --conn $SURREAL_HOST \
        --user $SURREAL_USER \
        --pass $SURREAL_PASS \
        --ns $SURREAL_NS \
        --db $SURREAL_DB \
        $REMOTE_TMP"
    echo "  OK"

    echo "[2/3] Baixando arquivo..."
    scp_get "$REMOTE_TMP" "$LOCAL_FILE"
    echo "  OK — $LOCAL_FILE ($(du -h "$LOCAL_FILE" | cut -f1))"

    echo "[3/3] Removendo temporário remoto..."
    ssh_exec "rm -f $REMOTE_TMP"
    echo "  OK"

    echo ""
    echo "  Backup salvo em: $LOCAL_FILE"
    echo "======================================================"
}

do_backup_full() {
    check_remote
    mkdir -p "$LOCAL_BACKUPS"

    FULL_DIR="$LOCAL_BACKUPS/pazini-full-$TIMESTAMP"
    mkdir -p "$FULL_DIR"

    header "BACKUP FULL (DB + uploads)"
    echo "  Destino  : $FULL_DIR"
    echo ""

    # DB
    REMOTE_TMP="/tmp/pazini-db-$TIMESTAMP.surql"
    LOCAL_DB="$FULL_DIR/database.surql"

    echo "[1/4] Exportando banco..."
    ssh_exec "docker exec $SURREAL_CONTAINER surreal export \
        --conn $SURREAL_HOST \
        --user $SURREAL_USER \
        --pass $SURREAL_PASS \
        --ns $SURREAL_NS \
        --db $SURREAL_DB \
        $REMOTE_TMP"
    echo "  OK"

    echo "[2/4] Baixando dump do banco..."
    scp_get "$REMOTE_TMP" "$LOCAL_DB"
    ssh_exec "rm -f $REMOTE_TMP"
    echo "  OK — database.surql ($(du -h "$LOCAL_DB" | cut -f1))"

    # Uploads
    REMOTE_UPLOADS_TAR="/tmp/pazini-uploads-$TIMESTAMP.tar.gz"
    LOCAL_UPLOADS_TAR="$FULL_DIR/uploads.tar.gz"

    echo "[3/4] Compactando uploads remotos..."
    ssh_exec "tar -czf $REMOTE_UPLOADS_TAR -C $REMOTE_PATH pazini-uploads 2>/dev/null || echo '  (diretório de uploads vazio ou inexistente)'"
    echo "  OK"

    echo "[4/4] Baixando uploads..."
    if ssh_exec "[ -f $REMOTE_UPLOADS_TAR ]"; then
        scp_get "$REMOTE_UPLOADS_TAR" "$LOCAL_UPLOADS_TAR"
        ssh_exec "rm -f $REMOTE_UPLOADS_TAR"
        echo "  OK — uploads.tar.gz ($(du -h "$LOCAL_UPLOADS_TAR" | cut -f1))"
    else
        echo "  (sem uploads para baixar)"
    fi

    echo ""
    echo "  Backup completo em: $FULL_DIR"
    echo "    $(ls "$FULL_DIR")"
    echo "======================================================"
}

do_restore() {
    check_remote

    BACKUP_FILE="${1:-}"
    if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
        echo "[ERRO] Informe um arquivo .surql válido"
        echo "Uso: $0 restore <arquivo.surql>"
        exit 1
    fi

    REMOTE_TMP="/tmp/pazini-restore-$TIMESTAMP.surql"

    header "RESTORE DB"
    echo "  Arquivo  : $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    echo ""
    echo "  ⚠  ATENÇÃO: os dados atuais serão REMOVIDOS e substituídos."
    echo ""
    read -r -p "  Confirmar? [s/N] " confirm
    [[ "$confirm" =~ ^[sS]$ ]] || { echo "  Cancelado."; exit 0; }
    echo ""

    echo "[1/4] Enviando arquivo para servidor..."
    scp_put "$BACKUP_FILE" "$REMOTE_TMP"
    echo "  OK"

    echo "[2/4] Removendo dados existentes (REMOVE DATABASE)..."
    ssh_exec "docker exec $SURREAL_CONTAINER surreal sql \
        --conn $SURREAL_HOST \
        --user $SURREAL_USER \
        --pass $SURREAL_PASS \
        --ns $SURREAL_NS \
        --db $SURREAL_DB \
        --hide-welcome \
        -q 'REMOVE DATABASE \`$SURREAL_DB\`; USE NS \`$SURREAL_NS\`; DEFINE DATABASE \`$SURREAL_DB\`;'"
    echo "  OK"

    echo "[3/4] Importando backup..."
    ssh_exec "docker exec $SURREAL_CONTAINER surreal import \
        --conn $SURREAL_HOST \
        --user $SURREAL_USER \
        --pass $SURREAL_PASS \
        --ns $SURREAL_NS \
        --db $SURREAL_DB \
        $REMOTE_TMP"
    echo "  OK"

    echo "[4/4] Removendo temporário remoto..."
    ssh_exec "rm -f $REMOTE_TMP"
    echo "  OK"

    echo ""
    echo "  Restore concluído com sucesso."
    echo "======================================================"
}

do_restore_full() {
    check_remote

    FULL_DIR="${1:-}"
    if [ -z "$FULL_DIR" ] || [ ! -d "$FULL_DIR" ]; then
        echo "[ERRO] Informe o diretório de backup-full"
        echo "Uso: $0 restore-full <diretório>"
        exit 1
    fi

    DB_FILE="$FULL_DIR/database.surql"
    UPLOADS_TAR="$FULL_DIR/uploads.tar.gz"

    if [ ! -f "$DB_FILE" ]; then
        echo "[ERRO] database.surql não encontrado em $FULL_DIR"
        exit 1
    fi

    header "RESTORE FULL (DB + uploads)"
    echo "  Diretório: $FULL_DIR"
    echo ""
    echo "  ⚠  ATENÇÃO: os dados e uploads atuais serão SUBSTITUÍDOS."
    echo ""
    read -r -p "  Confirmar? [s/N] " confirm
    [[ "$confirm" =~ ^[sS]$ ]] || { echo "  Cancelado."; exit 0; }
    echo ""

    # Restaura DB
    do_restore "$DB_FILE" --skip-confirm

    # Restaura uploads
    if [ -f "$UPLOADS_TAR" ]; then
        echo "[+] Restaurando uploads..."
        REMOTE_TAR="/tmp/pazini-uploads-restore-$TIMESTAMP.tar.gz"
        scp_put "$UPLOADS_TAR" "$REMOTE_TAR"
        ssh_exec "rm -rf $REMOTE_UPLOADS && tar -xzf $REMOTE_TAR -C $REMOTE_PATH && rm -f $REMOTE_TAR"
        echo "  OK — uploads restaurados em $REMOTE_UPLOADS"
    else
        echo "[!] uploads.tar.gz não encontrado — uploads não restaurados"
    fi

    echo ""
    echo "  Restore completo finalizado."
    echo "======================================================"
}

do_list() {
    echo ""
    echo "Backups disponíveis em $LOCAL_BACKUPS:"
    echo ""
    if [ ! -d "$LOCAL_BACKUPS" ] || [ -z "$(ls -A "$LOCAL_BACKUPS" 2>/dev/null)" ]; then
        echo "  (nenhum backup encontrado)"
    else
        ls -lh "$LOCAL_BACKUPS" | tail -n +2
    fi
    echo ""
}

# ── Roteador ──────────────────────────────────────────────────────────────────
CMD="${1:-}"

case "$CMD" in
    backup)         do_backup ;;
    backup-full)    do_backup_full ;;
    restore)        do_restore "$2" ;;
    restore-full)   do_restore_full "$2" ;;
    list)           do_list ;;
    *)
        echo ""
        echo "Uso: $0 <comando> [argumento]"
        echo ""
        echo "  backup                    Exporta DB remoto → ./backups/pazini-db-TIMESTAMP.surql"
        echo "  backup-full               Exporta DB + uploads → ./backups/pazini-full-TIMESTAMP/"
        echo "  restore <arquivo.surql>   Restaura DB no servidor remoto"
        echo "  restore-full <diretório>  Restaura DB + uploads"
        echo "  list                      Lista backups locais"
        echo ""
        echo "Configuração via front/.env.local:"
        echo "  REMOTE_HOST, REMOTE_USER, REMOTE_PATH, SSH_KEY"
        echo "  SURREAL_CONTAINER, SURREAL_USER, SURREAL_PASS, SURREAL_NS, SURREAL_DB"
        echo ""
        exit 1
        ;;
esac
