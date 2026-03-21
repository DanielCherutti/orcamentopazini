# 00 - Especificação de Deploy e DevOps

Esta especificação define o mecanismo de deploy via Docker e script de automação para servidor remoto, adaptado para a stack Next.js 16 + Bun.

## 1. Contexto e Objetivo
- **Contexto:** Necessidade de distribuir a aplicação em um servidor remoto linux de forma padronizada e isolada.
- **Objetivo:** Permitir deploy com um único comando, garantindo reprodutibilidade através de containers.
- **Referência Antiga:** Importado e adaptado de `refs/pazini-v1/front/deploy.sh` e `Dockerfile`.

## 2. Estrategia de Containerização (Docker)
A aplicação Next.js será empacotada em uma imagem Docker otimizada para produção.

### 2.1 Dockerfile (Multi-stage)
O `Dockerfile` deve ser localizado na raiz do frontend (`front/Dockerfile`) e seguir os estágios:
1.  **Deps**: Instala dependências (usando `bun install --frozen-lockfile`).
2.  **Builder**: Copia código fonte e executa `bun run build`.
    *   **Nota**: Next.js deve estar configurado com `output: 'standalone'` em `next.config.ts`.
3.  **Runner**: Imagem final leve (`oven/bun:1-slim` ou `alpine`).
    *   Copia `.next/standalone` e `.next/static`.
    *   Expõe porta 3000.
    *   Define `CMD ["bun", "run", "server.js"]`.

### 2.2 Docker Compose
Arquivo `docker-compose.yml` para orquestração simples no servidor:
- **Serviço App**: Build do contexto local/remoto.
- **Variáveis de Ambiente**: Injetadas via `.env.production`.
- **Rede**: Modo host ou bridge com porta exposta.
- **Volumes**: Se necessário para uploads (ex: `uploads/`).

## 3. Script de Deploy (`deploy.sh`)
Script bash autônomo para envio de código e execução remota.

### 3.1 Variáveis de Configuração
Carregadas de `front/.env.local` ou `front/.env` (não versionados):
- `REMOTE_HOST`: IP/Domínio do servidor.
- `REMOTE_USER`: Usuário SSH (padrão `root`).
- `REMOTE_PATH`: Caminho de destino no servidor (ex: `/app/pazini`).
- `SSH_KEY`: Caminho da chave privada (opcional, padrão `~/.ssh/id_rsa`).

### 3.2 Fluxo de Execução
1.  **Validação**: Checa presença das variáveis obrigatórias.
2.  **Preparação Remota**: Cria diretórios no servidor via SSH.
3.  **Transferência (SCP/Rsync)**:
    *   Envia código fonte (`src`, `public`, arquivos de config).
    *   **Exclui**: `node_modules`, `.next`, `.git`.
    *   Envia `front/.env.production` (se existir).
4.  **Build & Run Remoto**:
    *   Conecta via SSH.
    *   Executa `docker compose up -d --build --remove-orphans`.
    *   Executa limpeza de imagens antigas (`docker image prune -f`).

## 4. Requisitos de Segurança
- **Segurança de Dados**: `front/.env.production` contém segredos e nunca deve ser commitado.
- **Acesso ao Banco**: O container deve ter acesso de rede ao SurrealDB (via URL definida nas env vars).
- **Usuário Docker**: O container deve rodar com usuário não-root (definido no Dockerfile).

## 5. Critérios de Aceite
- [x] `Dockerfile` criado e validado para Next.js Standalone + Bun.
- [x] `deploy.sh` transfere arquivos corretamente ignorando lixo.
- [x] Comando remote dispara build do Docker e substitui container antigo.
- [x] Aplicação roda na porta 3000 dentro do container.

## 6. Comandos
- **Deploy**: `./deploy.sh` (requer configuração prévia).
- **Build Local (Teste)**: `docker build -t pazini-front .`
