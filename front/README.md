# Pazini — Frontend

Sistema de gestão empresarial (catálogo de produtos, orçamentos/propostas, clientes) construído com **Next.js 16 App Router**, **SurrealDB** e **Tailwind CSS 4**.

## Comandos de desenvolvimento

Todos os comandos são executados em `front/` usando **Bun**:

```bash
# Ambiente completo (SurrealDB + Next.js)
./dev.sh                     # a partir da raiz do repositório

# Somente frontend (SurrealDB já em execução)
bun run dev                  # servidor Next.js na porta 3000

# Build e produção
bun run build
bun run start

# Lint
bun run lint

# Banco de dados
docker compose up -d         # iniciar SurrealDB (raiz do repositório)
bun run init:db
bun run seed:products
bun run setup:surreal-schema

# Deploy
cd front && ./deploy.sh
```

## Status de Orçamento

O ciclo de vida de um orçamento segue a progressão:

```
Rascunho → Enviado → Aprovado
                   → Recusado
```

| Status (DB)  | Label UI  | Editável? | Preços      | Ações disponíveis          |
|-------------|-----------|-----------|-------------|----------------------------|
| `draft`     | Rascunho  | Sim       | Dinâmicos   | Editar, Enviar, Duplicar   |
| `sent`      | Enviado   | Não       | Congelados  | Aprovar, Recusar, Duplicar |
| `approved`  | Aprovado  | Não       | Congelados  | Duplicar                   |
| `rejected`  | Recusado  | Não       | Congelados  | Duplicar                   |

### Regras de transição

- **`draft → sent`**: cliente opcional (pode ser usado para negociação presencial sem cadastro).
- **`sent → approved`** e **`sent → rejected`**: ações manuais do usuário.
- **Sem retrocesso**: após ser Enviado, o orçamento nunca volta a Rascunho.
- **Duplicar** sempre cria um novo orçamento em Rascunho, independente do status original.

### Sincronização de preços (Rascunho)

Ao abrir um orçamento em status `draft`, os preços dos itens são automaticamente sincronizados com os valores atuais dos produtos no catálogo (`equipmentPrice` / `assemblyPrice`). O total do orçamento é recalculado se houver divergências. O processo é transparente para o usuário.

Orçamentos em `sent`, `approved` ou `rejected` têm os preços congelados no momento do envio.

### Proteção de edição

Tentativas de editar campos estruturais (título, cliente, descrição, condições) em orçamentos não-rascunho são bloqueadas na Server Action `updateBudgetAction` com retorno de erro explícito. O compositor (sidebar e conteúdo) oculta controles de edição quando `isReadOnly`.

## Arquitetura

- **Server Components por padrão** — Client Components (`"use client"`) somente quando há interatividade.
- **Server Actions** em `src/actions/` — mutations com validação Zod e retorno `{ success, error?, data? }`.
- **SurrealDB** exclusivamente no servidor — nunca importar `surrealdb.js` em Client Components.
- **URL como fonte de verdade** — estado de listagem (paginação, filtros, ordenação) em search params.
- **Workflow SDD** — toda feature requer spec validada em `specs/` antes da implementação.
