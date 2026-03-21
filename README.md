# Pazini - Sistema de Gestão

Sistema de gestão empresarial desenvolvido com Next.js 16, SurrealDB e Tailwind CSS 4, seguindo a metodologia **SDD (Spec Driven Development)**.

## 🚀 Stack Tecnológica

### Frontend
- **Framework:** Next.js 16 (App Router)
- **Linguagem:** TypeScript
- **Estilização:** Tailwind CSS 4
- **Componentes:** shadcn/ui
- **Ícones:** lucide-react
- **Formulários:** React Hook Form + Zod
- **Editor:** Tiptap (Rich Text)

### Backend
- **Banco de Dados:** SurrealDB
- **Runtime:** Node.js 20+
- **Gerenciador:** Bun

## 📁 Estrutura do Projeto

```
pazini/
├── specs/                    # Especificações técnicas (SDD)
│   ├── 00-*.spec.md         # Specs base (arquitetura, stack, design)
│   ├── 01-*.spec.md         # Specs de sistema (design system, padrões)
│   ├── 02-*.spec.md         # Specs de padrões de UI
│   └── YYYYMMDDHHMMSS-*.spec.md  # Specs de funcionalidades
├── front/                   # Aplicação Next.js
│   ├── src/
│   │   ├── app/            # Pages (App Router)
│   │   ├── components/     # Componentes React (ex.: budgets/scope/*, budgets/compositor/*, annotator/* modular)
│   │   ├── actions/        # Server Actions (orçamentos: módulos `budget-*-actions.ts`; em `"use client"` importar o arquivo onde a action está definida, não agregadores só com reexport)
│   │   ├── data/           # Dados estáticos versionados (ex.: novidades do login)
│   │   └── lib/            # Utilitários
│   └── public/             # Arquivos estáticos
├── .agent/                  # Configuração Antigravity
└── README.md               # Este arquivo
```

## 🎯 Metodologia SDD

Este projeto segue **Spec Driven Development**:

1. **Especificações primeiro:** Toda funcionalidade começa com uma spec
2. **Documentação viva:** Specs são a fonte da verdade
3. **Validação contínua:** Código deve estar alinhado com specs
4. **Evolução rastreável:** Mudanças documentadas em specs

### Specs Principais

- **`00-architecture.spec.md`** - Arquitetura do sistema
- **`00-stack.spec.md`** - Stack técnica e dependências
- **`01-design-system.spec.md`** - Sistema de design e cores
- **`02-listing-ui-pattern.spec.md`** - Padrão de telas de listagem
- **`20260127231000001-product-management.spec.md`** - Gestão de produtos
- **`20260321143000000-dashboard-inicio-hub.spec.md`** - Painel da página **Início** (`/dashboard`): indicadores, atalhos e orçamentos recentes
- **`20260321160000000-login-novidades.spec.md`** - Card de **novidades** na tela de login (`/`); conteúdo em `front/src/data/login-highlights.ts`

## 🛠️ Como Usar

### Pré-requisitos

- Node.js 20+
- Docker (para SurrealDB)
- Bun

### Instalação

```bash
# 1. Clonar repositório
git clone <repo-url>
cd pazini

# 2. Instalar dependências
cd front
bun install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env: **SURREALDB_PASS** (ou SURREAL_PASS) é obrigatório — a aplicação não usa senha padrão no código.
# Com o `docker-compose.yml` da raiz, use a mesma senha que aparece em `--pass` do serviço SurrealDB.
# Defina também **JWT_SECRET** (mínimo 32 caracteres aleatórios).

**Login da aplicação web** (`front/.env`): defina `JWT_SECRET` (mínimo **32 caracteres**) para assinar o cookie de sessão. As rotas **`/api/*`** só respondem com sessão válida (mesmo cookie `httpOnly`); sem autenticação, retornam **401** em JSON. Os **uploads** (`/api/upload/*`) também validam sessão no handler e impõem **tamanho máximo** e **tipo real do arquivo** (assinatura binária), não apenas o MIME enviado pelo navegador. Os usuários ficam no SurrealDB (`portal_user`). Para criar o primeiro usuário a partir do `.env`, rode em `front/`: `bun run seed:portal-user` (usa `PAZINI_LOGIN_EMAIL` / `PAZINI_LOGIN_PASSWORD`). Depois é possível cadastrar, inativar/reativar e alterar senha no modal da linha; a **remoção** é feita pelo ícone de lixeira na lista, com confirmação e as mesmas regras de “pelo menos um usuário ativo” e de não remover a própria conta.

**Senhas no portal:** ao criar usuário ou redefinir senha na UI, a senha precisa ser forte (mínimo 12 caracteres, maiúscula, minúscula, número e símbolo) e é verificada contra a base pública **Have I Been Pwned** (apenas um trecho do hash SHA-1 é enviado, não a senha literal). Variáveis opcionais em `front/.env`: `PAZINI_SKIP_PWNED_PASSWORD_CHECK=true` desliga só a checagem HIBP; `PAZINI_ALLOW_PASSWORD_IF_PWNED_CHECK_FAILS=true` aceita a senha se a API estiver indisponível (útil em rede restrita, com trade-off de segurança). O script `seed:portal-user` grava a senha do `.env` diretamente no banco **sem** essa política (só para bootstrap); use uma senha forte também no `.env` se for ambiente compartilhado.

# 4. Iniciar SurrealDB (Docker)
cd ..
docker-compose up -d

# 5. Iniciar aplicação
cd front
bun run dev
```

### Scripts Disponíveis

```bash
bun run dev        # Inicia servidor de desenvolvimento
bun run build      # Build de produção
bun run start      # Inicia servidor de produção
bun run lint       # Executa linter
```

O **login** fica na raiz **`/`** (título da aba “Entrar”). **Cores da interface** (primária e secundária) vêm de **Configurações da empresa** (`proposal_settings`); são aplicadas em variáveis CSS no layout autenticado e na página de login via leitura pública só de branding (`getPublicProposalBrandingAction`). Valores hex inválidos são ignorados e caem nos padrões (`#1e3a8a` / `#ea580c`). Logo no login: URL das configurações, depois `NEXT_PUBLIC_BRAND_LOGO_URL`, senão `/public/logo.jpeg`.

Após o login, a rota **`/dashboard` (Início)** exibe um painel com contagens de produtos, grupos, orçamentos e clientes, atalhos para criar registros e uma lista dos orçamentos mais recentes com link direto para o workspace. A logo do cartão de boas-vindas usa **Configurações → URL da logo** (`company_logo_url`); opcionalmente `NEXT_PUBLIC_BRAND_LOGO_URL` no `.env`; se ambos vazios, cai em `/public/logo.jpeg`. URLs `http(s)` e `data:image/...` são exibidas com `<img>` para não depender de `remotePatterns` do Next.

### Novidades no login (card ao lado do formulário)

O conteúdo **não vem do banco** nem da tela de Configurações: é **código versionado**, para você publicar novidades a cada release sem UI extra.

1. **Arquivo:** edite `front/src/data/login-highlights.ts`.
2. **Lista principal:** o array `loginHighlights` — cada item pode ter:
   - **`title`** (obrigatório): título curto.
   - **`description`** (opcional): uma ou duas frases para o usuário.
   - **`kind`** (opcional): `"feature"` (selo “Novo”), `"improvement"` (padrão, “Melhoria”) ou `"fix"` (“Correção”).
   - **`date`** (opcional): string `YYYY-MM-DD`; aparece formatada em pt-BR.
3. **Título e subtítulo do bloco:** constantes `LOGIN_HIGHLIGHTS_TITLE` e `LOGIN_HIGHLIGHTS_SUBTITLE` no mesmo arquivo.
4. **Ordem:** coloque o que é mais recente **no topo** do array (a lista é exibida nessa ordem).
5. **Ocultar o card:** use `export const loginHighlights: LoginHighlight[] = [];` — o componente não renderiza nada.
6. **Publicar:** commit + deploy (ou `bun run build` / pipeline habitual). Não é necessário reiniciar só por mudar texto em dev: o hot reload atualiza.

Spec de referência: `specs/20260321160000000-login-novidades.spec.md`.

## 📚 Padrões de Desenvolvimento

### Telas de Listagem

Todas as telas de listagem seguem o padrão definido em `specs/02-listing-ui-pattern.spec.md`:

**Funcionalidades obrigatórias:**
- ✅ Busca com debounce
- ✅ Paginação completa (Primeira, Anterior, Próxima, Última)
- ✅ Seletor de itens por página (10/20/50/100)
- ✅ Ordenação por colunas (clicável)
- ✅ Ordenação locale-aware (pt-BR) para acentuação
- ✅ Navegação AJAX (sem reload)
- ✅ Loading states
- ✅ Responsividade (tabela desktop / cards mobile)

**Exemplo de referência:** `/dashboard/products`

### Commits

Seguimos **Conventional Commits** em português:

```
feat(produtos): adiciona ordenação por colunas
fix(paginacao): corrige contagem total
docs(specs): atualiza padrão de listagem
```

### Branches

Seguimos **Gitflow**:

- `main` - Produção
- `develop` - Desenvolvimento
- `feature/{numero}-{nome}` - Novas funcionalidades
- `hotfix/{descricao}` - Correções urgentes

## 🎨 Design System

### Cores Principais

- **Primary:** Azul Pazini (#2E3A87)
- **Accent:** Amarelo Pazini (#FBB03B)
- **Success:** Verde (#22C55E)
- **Destructive:** Vermelho (#EF4444)

### Componentes

Utilizamos **shadcn/ui** como base. Componentes são instalados sob demanda em `components/ui/`.

## 🔒 Segurança

- Validação com Zod em todas as entradas
- Server Actions para operações sensíveis
- **Sessão nas actions:** operações que leem ou alteram dados exigem `assertActionSession()` (complementa o proxy em `/api`).
- **Senha do SurrealDB:** sem valor padrão no código; use `SURREALDB_PASS` ou `SURREAL_PASS` no `.env` (`front/src/lib/surreal-env.ts`). Não commite `.env` nem segredos reais no repositório.
- **Rate limit:** login por IP (`loginAction`); rotas `/api` no proxy (uploads POST, SSE `…/live` e demais APIs com limites separados). Configurável via `PAZINI_RATE_LIMIT_*` em `front/.env.example`. Em várias réplicas, cada instância contabiliza separado — para limite global, use camada externa (API gateway / WAF).
- **IDs de registros:** parâmetros de ID passam por allowlist de tabela + formato estrito (`front/src/lib/surreal-record-ids.ts`), reduzindo injeção e uso de record ids malformados. **Escopo atual:** instância single-tenant — não há segregação por cliente/empresa por linha; qualquer usuário autenticado acessa todos os recursos da base.
- Sanitização de HTML no editor Tiptap
- Variáveis de ambiente para credenciais

## 📊 Performance

- **SSR** para primeira carga (SEO)
- **AJAX** para navegação (UX)
- **Debounce** em buscas (300ms)
- **Paginação** no servidor
- **Lazy loading** de imagens

## 🧪 Testes

```bash
# Executar testes (quando implementados)
bun test

# Executar linter
bun run lint
```

## 📖 Documentação

- **Specs:** Consulte `specs/` para detalhes técnicos
- **ADRs:** Decisões arquiteturais em `docs/adr/`
- **Componentes:** Documentação inline nos arquivos
- **API:** Server Actions documentadas em `actions/`

### Architecture Decision Records (ADRs)

Decisões arquiteturais importantes estão documentadas em `docs/adr/`:

- **[ADR 001](docs/adr/001-locale-aware-sorting.md):** Ordenação locale-aware no JavaScript
- **[ADR 002](docs/adr/002-hybrid-navigation-listings.md):** Navegação híbrida SSR + AJAX
- **[ADR 003](docs/adr/003-url-as-source-of-truth.md):** URL como fonte da verdade

Consulte o [índice completo](docs/adr/README.md) para mais detalhes.

## 🚀 Deploy

```bash
# Build de produção
bun run build

# Iniciar servidor
bun run start
```

### Deploy via Docker (produção)

Use o script `front/deploy.sh`. O servidor deve usar `front/docker-compose.prod.yml` ou um compose equivalente que monte o volume de uploads:

```yaml
volumes:
  - ./pazini-uploads:/app/uploads
```

### Onde as imagens ficam no servidor (troubleshooting 404)

As imagens de orçamentos são servidas pela rota `/api/uploads/budgets/images/{uuid}.png`. No servidor, o arquivo físico fica em:

| Contexto | Caminho completo |
|----------|-------------------|
| **Dentro do container** | `/app/uploads/budgets/images/{uuid}.png` |
| **No host** (com volume) | `{REMOTE_PATH}/pazini-uploads/budgets/images/{uuid}.png` |

**Exemplo** (URL 404: `/api/uploads/budgets/images/b7cd18b0-e4b2-4252-b37d-4cbee302281a.png`):

- No host (REMOTE_PATH típico `/root/docker`): `/root/docker/pazini-uploads/budgets/images/b7cd18b0-e4b2-4252-b37d-4cbee302281a.png`
- No container: `/app/uploads/budgets/images/b7cd18b0-e4b2-4252-b37d-4cbee302281a.png`

**Comandos para verificar no servidor:**

```bash
# No host (se usar volume)
ls -la /root/docker/pazini-uploads/budgets/images/b7cd18b0-e4b2-4252-b37d-4cbee302281a.png

# Dentro do container
docker exec pazini-app ls -la /app/uploads/budgets/images/b7cd18b0-e4b2-4252-b37d-4cbee302281a.png
```

**Se o arquivo não existir**, causas comuns:
1. **Volume não configurado** — o compose não mapeia `./pazini-uploads:/app/uploads`; ao recriar o container, os arquivos se perdem
2. **Imagens antigas** — foram enviadas antes do volume existir; não há como recuperar exceto por backup
3. **Restore** — use `./db-backup.sh restore-full <dir>` para restaurar uploads de um backup completo

## 🤝 Contribuindo

1. Crie uma spec para a funcionalidade
2. Aguarde aprovação da spec
3. Crie branch `feature/{numero}-{nome}`
4. Implemente conforme spec
5. Marque checklist da spec
6. Commit com Conventional Commits
7. Pull Request para `develop`

## 📝 Licença

[Definir licença]

## 👥 Equipe

Pazini Development Team

---

**Última atualização:** 2026-03-18
