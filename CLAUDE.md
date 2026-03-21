# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pazini is an enterprise management system (product catalog, budgets/quotations, clients) built with Next.js 16 App Router, SurrealDB, and Tailwind CSS 4. The project follows **Spec Driven Development (SDD)** — all features must have a validated spec in `specs/` before implementation.

## Development Commands

All commands run from the `front/` directory using Bun:

```bash
# Full dev environment (SurrealDB + Next.js)
./dev.sh                    # from repo root

# Frontend only (requires SurrealDB already running)
bun run dev                 # Next.js dev server on port 3000

# Build & Production
bun run build               # production build (standalone output)
bun run start               # production server

# Lint
bun run lint                # ESLint (flat config, v9)

# Database
docker compose up -d        # start SurrealDB (from repo root)
bun run init:db             # initialize database
bun run seed:products       # seed product data
bun run setup:surreal-schema # setup schemas
bun run setup:clients       # setup client data
bun run setup:annotations   # setup annotations schema
bun run migrate:20260203    # run specific migration

# Deploy
cd front && ./deploy.sh     # build Docker image, upload, restart on remote
```

## Architecture

### Monorepo Layout

- `specs/` — Spec files (source of truth for all features). `00-*` are foundational, timestamp-prefixed are feature specs.
- `front/` — Next.js application (all source code lives here)
- `docs/adr/` — Architecture Decision Records
- `.agent/` — Antigravity Kit (agents, skills, workflows, project rules)
- `.cursorrules` — SDD methodology rules (also applies to Claude)

### Key Architectural Patterns

**Server-First with RSC**: React Server Components by default. Client Components (`"use client"`) only when interactivity is needed. SurrealDB access is **server-side only** — never import `surrealdb.js` in client components.

**Server Actions for mutations**: All data mutations go through Server Actions in `front/src/actions/`. Each action uses Zod validation and returns `{ success: boolean, error?: string, fieldErrors?: Record<string, string[]> }`.

**URL as source of truth**: Listing state (page, limit, query, sortBy, sortOrder) lives in URL search params, not React state. This enables bookmarking, sharing, and browser history.

**Hybrid navigation**: SSR for initial page load, AJAX for subsequent pagination/filtering (no full reloads).

**Locale-aware sorting**: All sorting uses `Intl.Collator` with pt-BR locale in JavaScript (not DB-level), then paginates. See ADR 001.

### Data Flow

```
Client Component → Server Action → SurrealDB → sanitized DTO → Client
Server Component → direct DB query → rendered HTML
```

### Source Structure (front/src/)

- `app/(main)/` — Route groups: `dashboard/products`, `budgets`, `settings`
- `actions/` — Server Actions (product-actions.ts, budget-actions.ts, auth-actions.ts, etc.)
- `components/ui/` — shadcn/ui base components
- `components/{feature}/` — Feature-specific components (products, budgets, annotator, pdf)
- `lib/surreal.ts` — SurrealDB singleton connection
- `lib/surreal-schemas.ts` — Database schemas and migrations
- `types/` — TypeScript type definitions
- `hooks/` — Custom React hooks

### Database

SurrealDB (NoSQL) running via Docker Compose on port 8000. Connection configured via env vars (`SURREALDB_HOST`, `SURREALDB_PORT`, `SURREALDB_NS=pazini`, `SURREALDB_DB=core`). Tables: `product`, `product_group`, `client`, `budget`, `budget_annotation`.

### UI Stack

shadcn/ui (Radix-based) components installed on demand in `components/ui/`. Forms use React Hook Form + Zod. Rich text editing via Tiptap. Canvas annotations via Konva/react-konva. PDF export via @react-pdf/renderer. Design tokens: Primary blue `#2E3A87`, Accent yellow `#FBB03B`.

## SDD Workflow (from .cursorrules)

1. Before implementing any feature, check `specs/` for an existing spec
2. If spec exists and passes checklist → implement directly
3. If spec doesn't exist → create/propose spec and wait for user approval
4. Never implement without a valid spec (except critical bugfixes or minor technical adjustments)
5. After implementation, mark spec checklist items as complete

## Antigravity Kit (.agent/)

The `.agent/` directory contains the **Antigravity Kit** — a modular system of AI agents, skills, and workflows. Consult these resources when working on specialized tasks.

### Project Rules (.agent/pazini/ and .agent/rules/)

- `.agent/rules/PAZINI.md` — Always-on project rules (SDD, Git, quality, dependencies, docs)
- `.agent/pazini/01-sdd-core.md` — SDD core workflow and spec consultation rules
- `.agent/pazini/02-git-versioning.md` — Gitflow and Conventional Commits rules
- `.agent/pazini/03-quality-testing.md` — Quality standards and testing strategy
- `.agent/pazini/04-dependencies-security.md` — Dependency guardrails and security
- `.agent/pazini/05-documentation-ux.md` — Documentation centralization (README only)
- `.agent/pazini/06-architecture-evolution.md` — ADRs, deprecation, breaking changes
- `.agent/pazini/07-checklist-management.md` — Spec checklist marking rules

### Specialist Agents (.agent/agents/)

20 role-based agents with specific expertise. Key ones for this project:

| Agent | Use When |
|-------|----------|
| `frontend-specialist` | React/Next.js UI work, component design |
| `backend-specialist` | API patterns, Server Actions, business logic |
| `database-architect` | SurrealDB schema design, queries, migrations |
| `debugger` | Root cause analysis, systematic debugging |
| `devops-engineer` | Docker, deployment, CI/CD |
| `security-auditor` | Security compliance, vulnerability scanning |
| `test-engineer` | Testing strategies, test writing |
| `performance-optimizer` | Web Vitals, speed optimization |
| `project-planner` | Task breakdown, discovery |
| `orchestrator` | Multi-agent coordination |

### Skills (.agent/skills/)

36 domain-specific knowledge modules loaded on demand. Most relevant for Pazini:

- `nextjs-react-expert` — React & Next.js patterns (57 rules)
- `tailwind-patterns` — Tailwind CSS v4 utilities
- `frontend-design` — UI/UX patterns, design systems
- `api-patterns` — REST, GraphQL, tRPC
- `database-design` — Schema design, optimization
- `testing-patterns` — Jest, Vitest strategies
- `webapp-testing` — E2E, Playwright
- `deployment-procedures` — CI/CD, deploy workflows
- `systematic-debugging` — Troubleshooting methodology
- `seo-fundamentals` — SEO, Core Web Vitals
- `architecture` — System design patterns
- `clean-code` — Coding standards
- `code-review-checklist` — Code review standards

### Workflows (.agent/workflows/)

Slash-command procedures for common tasks:

| Command | Purpose |
|---------|---------|
| `/create` | Create new features |
| `/debug` | Debug issues |
| `/deploy` | Deploy application |
| `/enhance` | Improve existing code |
| `/plan` | Task breakdown |
| `/test` | Run tests |
| `/brainstorm` | Socratic discovery |
| `/status` | Check project status |
| `/orchestrate` | Multi-agent coordination |

### Validation Scripts (.agent/scripts/)

```bash
python .agent/scripts/checklist.py .          # Quick validation (security, lint, types, tests)
python .agent/scripts/verify_all.py . --url http://localhost:3000  # Full suite (+ Lighthouse, E2E, bundle)
```

## Git Workflow (MANDATORY)

Every code change MUST follow these rules. No exceptions.

### Branches (Gitflow)

| Branch | Purpose |
|--------|---------|
| `main` | Production — stable, tested code only |
| `development` | Integration — default base for all work |
| `feature/{number}-{name}` | New features (branch off `development`) |
| `hotfix/{description}` | Urgent production fixes (branch off `main`) |
| `release/{version}` | Release preparation |

**Rules:**
- NEVER commit directly to `main` or `development`
- Always create a `feature/` branch before implementing any non-trivial change
- Branch off from `development` (not `main`) for new features
- Merge back to `development` via PR when done

### Conventional Commits

**Format:** `<type>(<scope>): <description in Portuguese>`

| Type | Use when |
|------|----------|
| `feat` | Adding a new feature |
| `fix` | Fixing a bug |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `style` | Formatting, whitespace (no logic change) |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build process, dependencies, tooling |
| `perf` | Performance improvement |
| `ci` | CI/CD configuration |

**Examples:**
```
feat(budgets): adiciona exportação para PDF
fix(products): corrige validação de preço negativo
refactor(auth): simplifica fluxo de login
```

**Rules:**
- Description MUST be in Portuguese (pt-BR), imperative mood
- Scope is the feature/module affected (products, budgets, clients, auth, etc.)
- NEVER commit without a conventional commit message
- NEVER use `--no-verify` to skip hooks

## Conventions

- **Language**: Code in English, specs and commit messages in Portuguese (pt-BR)
- **Path alias**: `@/*` maps to `front/src/*`
- **Dependencies**: Avoid adding new deps without justification in spec or ADR
- **File size**: Prefer <300 lines per file, <50 lines per function
- **New deps**: Must be justified, prefer standard library when possible
