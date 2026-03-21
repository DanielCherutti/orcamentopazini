# 00 - Especificação de Stack Técnica

Esta especificação define a stack tecnológica, ferramentas e plataformas de build/distribuição do projeto. Use-a como referência para todas as decisões técnicas de implementação.

## 1. Contexto e Objetivo
- **Contexto:** Projeto precisa de uma stack tecnológica definida e justificada para garantir consistência, portabilidade e manutenibilidade.
- **Objetivo:** Estabelecer linguagem, runtime, ferramentas de build, empacotamento e plataformas alvo de forma clara e testável.
- **Escopo:** Stack técnica completa (linguagem, ferramentas, build, distribuição). Decisões arquiteturais de alto nível estão em `00-architecture.spec.md`. Contexto global do projeto está em `00-global-context.spec.md`.
- **Nota sobre repositório:** O código-fonte do sistema está na pasta `front/`. Este repositório contém as especificações (specs) na raiz e o código em `front/`.

## 2. Requisitos Funcionais
- **Framework Full Stack**: Next.js para frontend e backend (BFF/API).
- **Type Safety**: TypeScript em todo o projeto.
- **Performance**: Build otimizado para produção, SSR/RSC para performance inicial.
- **Ferramentas padronizadas**: Uso consistente de ferramentas de desenvolvimento (formatação, lint, testes).

## 3. Stack e Plataformas

### 3.1 Linguagem e Runtime
- **Linguagem:** TypeScript 5.x (frontend e backend)
- **Justificativa:** 
  - Type safety para reduzir erros em tempo de compilação.
  - Integração nativa com Next.js.
- **Runtime:** Bun 1.2+
  - **Uso**: Gerenciador de pacotes, executor de scripts e runtime local.
  - **Justificativa**: Performance superior em instalação e execução.

### 3.2 Ferramentas de Build e Desenvolvimento
- **Framework:** Next.js 16.1.6+ (App Router)
- **Biblioteca UI:** React 19.2.3+
- **Gerenciamento de dependências:** `package.json` + `bun.lock` (Bun)
- **Estilização:** Tailwind CSS 4.x
- **Componentes:** shadcn/ui (baseado em Radix UI/Tailwind)
- **Linting:** ESLint 9.x + eslint-config-next
- **Formatação:** Prettier (opcional/integrado ao editor)

### 3.3 Backend e Dados
- **Backend Framework:** Next.js Server Actions & API Routes (Atuando como BFF/API).
- **Banco de Dados:** SurrealDB
  - **Nota de Segurança**: Acesso **EXCLUSIVO** via Server Side. Frontend jamais deve conectar diretamente.
  - **Schemas**: Gerenciados e validados na camada de API (Server Side).
- **Cliente DB:** `surrealdb.js` (Server Side Only)

### 3.4 Empacotamento e Distribuição
- **Build:** `bun run build` (invoca `next build`)
- **Artefato:** `.next/` standalone ou static export (dependendo do deploy).
- **Ambiente:** Node.js ou Bun compatível para execução do servidor Next.js.

### 3.5 Plataformas Alvo
- **Navegadores**: Chrome, Firefox, Safari, Edge (versões modernas - "Evergreen").
- **Servidor**: Container Docker ou ambiente Node.js/Bun capaz de rodar Next.js.

## 4. Estrutura de Build
```
front/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # Componentes React
│   ├── lib/              # Utilitários e configurações
│   ├── actions/          # Server Actions
│   └── types/            # Definições de tipos
├── public/               # Assets estáticos
├── next.config.ts        # Configuração Next.js
├── package.json          # Dependências
├── bun.lock              # Lock file
└── .env.local            # Variáveis de ambiente
```

## 5. Critérios de Aceite
- [x] Linguagem (TypeScript) e Runtime (Bun) definidos.
- [x] Framework (Next.js 16) definido.
- [x] Ferramentas de estilo (Tailwind 4) e lint estão configuradas.
- [x] Estrutura de diretórios alinhada com Next.js App Router.

## 6. Comandos Principais
- **Instalar:** `bun install`
- **Dev:** `bun run dev`
- **Build:** `bun run build`
- **Start:** `bun run start`
- **Lint:** `bun run lint`
