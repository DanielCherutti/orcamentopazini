# 00 - Especificação de Arquitetura

Esta especificação define o padrão arquitetural, estrutura de diretórios e decisões de design do sistema usando Next.js 16.

## 1. Contexto e Objetivo
- **Referência:** Stack técnica em `00-stack.spec.md`.
- **Objetivo:** Estabelecer padrão arquitetural usando Next.js App Router e Server Actions.

## 2. Padrão Arquitetural

### 2.1 Arquitetura Next.js Full Stack
- **Modelo:** React Server Components (RSC) por padrão.
- **Client Side:** Client Components para interatividade (`"use client"`).
- **Server Side:** 
  - Server Actions para mutações e formulários.
  - Route Handlers para APIs RESTful (se necessário).
  - Middleware para proteção de rotas e manipulação de requisições.

### 2.2 Camadas
1. **UI Layer (Frontend)**:
   - Pages (`page.tsx`)
   - Layouts (`layout.tsx`)
   - Components (Reutilizáveis)
   - Hooks (Lógica de estado client-side)
2. **Data Access Layer (Backend)**:
   - Server Actions: Funções assíncronas que executam no servidor.
   - Services/Dal: Funções que interagem com o banco de dados (SurrealDB).
   - DTOs/Types: Validação de dados (Zod).

### 2.3 Fluxo de Dados
- **Fetching:** Realizado preferencialmente em Server Components (async/await direto no DB ou via API).
- **Updates:** Realizados via Server Actions, invocadas por formulários ou event handlers em Client Components.
- **State:** URL State via Search Params (preferido) ou React State (Client).

## 3. Estrutura de Diretórios
```
front/
├── src/
│   ├── app/
│   │   ├── (auth)/         # Grupo de rotas de autenticação
│   │   ├── (dashboard)/    # Grupo de rotas do painel
│   │   ├── api/            # Route handlers (se necessário)
│   │   ├── layout.tsx      # Root Layout
│   │   └── page.tsx        # Home Page
│   ├── components/
│   │   ├── ui/             # shadcn/ui components
│   │   ├── forms/          # Formulários
│   │   └── ...
│   ├── lib/                # Utils, DB connection
│   ├── actions/            # Server Actions (ex: auth-actions.ts)
│   └── types/              # Zod schemas e interfaces TS
└── ...
```

## 4. Padrões de Design
- **Composition**: Preferir composição de componentes a herança.
- **Server-First**: Mover lógica para o servidor sempre que possível para reduzir bundle JS.
- **Colocation**: Manter arquivos relacionados próximos (exceto componentes globais).
- **Zod Validation**: Validar inputs em Server Actions e Outputs se vindo de fontes externas.

## 5. Integração com SurrealDB
- **Server Side Only**: A conexão com o SurrealDB deve ser instanciada e utilizada **APENAS** no lado servidor (`Server Actions`, `Route Handlers`, `Server Components`).
- **Bloqueio no Client**: É **PROIBIDO** importar ou usar o driver do SurrealDB em Client Components (`"use client"`). Isso previne vazamento de credenciais e schemas.
- **Gerenciamento de Schemas**: A API server-side é responsável por definir e validar schemas (usando Zod e queries do Surreal).
- **Conexão**: Instanciada em `src/lib/surreal.ts` (ou similar) como um Singleton no ambiente Node/Bun.
- **Server Actions**: Chamam funções do SurrealDB diretamente (ou via service layer) e retornam DTOs sanitizados para o frontend.

## 6. Tratamento de Erros
- `error.tsx` para Error Boundaries em rotas.
- `not-found.tsx` para 404.
- Retorno de objetos `{ success: boolean, error?: string }` em Server Actions para tratamento no client.

## 7. Critérios de Aceite
- [x] Estrutura definida para App Router.
- [x] Papel de Server Components e Client Components claro.
- [x] Fluxo de Server Actions definido.
