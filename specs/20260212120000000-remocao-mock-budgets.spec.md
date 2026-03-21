# 20260212120000000 - Remoção do Sistema Mock de Orçamentos

Especificação para eliminar toda a infraestrutura de mock do módulo de orçamentos, consolidando o sistema 100% no backend real (SurrealDB via Server Actions).

## 1. Contexto e Objetivo

- **Contexto:** O módulo de orçamentos foi desenvolvido com uma arquitetura dual (mock via localStorage / real via SurrealDB), controlada pela env `NEXT_PUBLIC_BUDGETS_MODE`. Isso serviu para prototipagem rápida, mas agora o `realBudgetsRepository` já implementa **todas** as operações da interface `BudgetsRepository`. O modo mock ficou como dívida técnica — adiciona complexidade, código morto e condicionais desnecessários em 10+ arquivos.
- **Objetivo:** Remover 100% do código mock, simplificar os componentes que tinham branch mock/real, e garantir que o sistema funcione exclusivamente com SurrealDB.
- **Escopo:**
  - **Dentro:** Remoção de arquivos mock, remoção de condicionais `isMockBudgetsEnabled()`, simplificação de componentes, adição de `deleteBudgetAction` (operação que só existia no mock), limpeza de imports.
  - **Fora:** Melhorias no PDF, DOCX, upload de imagem no rich text editor (specs separadas).

## 2. Requisitos Funcionais

### 2.1 Remoção de Arquivos Mock
Arquivos a serem **deletados**:
| Arquivo | Linhas | Motivo |
|---------|--------|--------|
| `front/src/lib/budgets/mock-budgets-repository.ts` | ~460 | Repositório inteiro via localStorage |
| `front/src/lib/budgets/mock-catalog.ts` | ~80 | Dados fictícios (produtos, clientes, grupos) |
| `front/src/lib/budgets/budgets-mode.ts` | ~16 | Toggle mock/real |
| `front/src/lib/budgets/get-budgets-repository.ts` | ~12 | Factory que escolhe mock ou real |

### 2.2 Remoção do Hook `use-budgets-repository`
Verificar se `useBudgetsRepository()` (que retorna o repository via factory) pode ser substituído por import direto do `realBudgetsRepository`, ou se é melhor manter o hook simplificado (sem branch mock).

### 2.3 Simplificação de Componentes
Componentes que contêm `isMockBudgetsEnabled()` e precisam ser simplificados:

| Componente | O que remover |
|------------|---------------|
| `budgets/workspace/budget-data-section.tsx` | Branch mock do ClientSelector (linhas 82-107) → usar apenas `<ClientSelector>` real |
| `budgets/editor/inline-item-creator.tsx` | Componente `MockProductSelector` inteiro (~60 linhas) + branch mock → usar apenas `<ProductSelector>` real |
| `budgets/editor/add-group-dialog.tsx` | Branch mock no `useState` e `handleGroupChange` → usar apenas `listProductGroupsWithProductsAction` |
| `budgets/budget-workspace.tsx` | Remover import/uso de `isMockBudgetsEnabled` |
| `budgets/workspace/budget-preview-tab.tsx` | Branch mock de settings hardcoded (linhas 59-67) → usar apenas `getProposalSettingsAction` |
| `budgets/budget-photo-annotator-dialog.tsx` | Remover condicionais mock |
| `app/(main)/budgets/page.tsx` | Remover branch que retorna lista vazia no mock (linhas 35-41) → SSR sempre |
| `app/(main)/budgets/budget/[id]/page.tsx` | Remover branch `BudgetPageClient` mock (linhas 22-28) → SSR sempre |
| `app/(main)/budgets/budget/[id]/pdf/page.tsx` | Remover branch `BudgetPdfPageClient` mock → SSR sempre |

### 2.4 Remoção de Client Pages Mock
Verificar se existem componentes `BudgetPageClient` e `BudgetPdfPageClient` que só são usados em modo mock e podem ser deletados.

### 2.5 Action de Deletar Orçamento
Implementar `deleteBudgetAction(budgetId: string)` — operação que existia implicitamente no mock (via remoção do localStorage) mas não existe como Server Action.

- Ao deletar um orçamento:
  1. Deletar todos os `budget_image` vinculados
  2. Deletar todos os `budget_item` vinculados
  3. Deletar todos os `budget_section` vinculados
  4. Deletar todos os `budget_location` vinculados
  5. Deletar o `budget` em si
  6. `revalidatePath("/budgets")`
- Retorno: `{ success: boolean; error?: string }`

### 2.6 Limpeza de Variável de Ambiente
Remover `NEXT_PUBLIC_BUDGETS_MODE` de:
- `.env.local` (se existir)
- `.env.example` (se existir)
- Documentação (CLAUDE.md, README)

## 3. Contratos e Interfaces

### 3.1 Interface BudgetsRepository
Manter a interface `BudgetsRepository` em `budgets-repository.ts` **como está** (pode ser útil para testes futuros). Apenas remover os imports e referências ao mock.

### 3.2 Server Action: deleteBudgetAction
```typescript
// front/src/actions/budget-core-actions.ts
export async function deleteBudgetAction(budgetId: string): Promise<{ success: boolean; error?: string }>
```

### 3.3 Componentes Simplificados
Após remoção dos branches mock, os componentes devem:
- Importar apenas os componentes reais (`ClientSelector`, `ProductSelector`)
- Não importar nada de `budgets-mode`, `mock-catalog`, `mock-budgets-repository`
- Usar SSR (Server Components) onde possível, sem fallback client-only

## 4. Fluxos e Estados

### 4.1 Fluxo de Migração
1. Criar `deleteBudgetAction` primeiro (dependência para funcionalidade completa)
2. Remover branches mock dos componentes (um por um, testando)
3. Deletar arquivos mock
4. Remover env var e referências
5. Build de verificação (`bun run build`)

### 4.2 Estado Pós-Remoção
- `bun run build` deve compilar sem erros
- Nenhum import referenciando arquivos deletados
- Nenhuma menção a "mock" no código de produção (exceto em testes, se houver)

## 5. Dados

### 5.1 Nenhuma alteração de schema
O SurrealDB já possui todas as tabelas necessárias. As Server Actions já existem e funcionam.

### 5.2 deleteBudgetAction — queries
```sql
DELETE budget_image WHERE budget_id = $budgetId;
DELETE budget_item WHERE budget_id = $budgetId;   -- verificar se existe relação direta
DELETE budget_section WHERE budget_id = $budgetId; -- verificar relação via location
DELETE budget_location WHERE budget_id = $budgetId;
DELETE $budgetId;
```
Nota: Verificar a estrutura exata das relações no schema antes de implementar. Pode ser necessário cascatear via locations → sections → items.

## 6. NFRs (Não Funcionais)

- **Desempenho:** A remoção do mock vai **melhorar** o bundle size (menos código client-side). Sem regressão esperada.
- **Segurança:** `deleteBudgetAction` deve validar autenticação (consistente com outras actions). A remoção do localStorage elimina dados não criptografados do navegador.
- **Observabilidade:** Manter `console.error` em caso de falha de deleção, consistente com padrão existente.

## 7. Guardrails

- **Não adicionar dependências** — esta é uma spec de remoção de código.
- **Não alterar funcionalidade** — o comportamento para o usuário deve ser idêntico ao modo `real` atual.
- **Build limpo** — `bun run build` deve passar sem warnings de import.
- **Lint limpo** — `bun run lint` sem erros novos.

## 8. Critérios de Aceite

- [x] Arquivos mock deletados (`mock-budgets-repository.ts`, `mock-catalog.ts`, `budgets-mode.ts`, `get-budgets-repository.ts`)
- [x] Nenhum import de arquivos mock em qualquer componente
- [x] Nenhuma chamada a `isMockBudgetsEnabled()` no codebase
- [x] `MockProductSelector` removido de `inline-item-creator.tsx`
- [x] Client pages mock-only removidas (`BudgetPageClient`, `BudgetPdfPageClient`)
- [x] `deleteBudgetAction` implementada e funcional
- [x] Todos os componentes do workspace funcionam com dados reais (SurrealDB)
- [x] Listagem de orçamentos usa SSR sempre (sem branch localStorage vazio)
- [x] Preview/PDF usa `getProposalSettingsAction` sempre (sem settings hardcoded)
- [x] `bun run build` passa sem erros
- [x] `bun run lint` passa sem erros novos
- [x] Variável `NEXT_PUBLIC_BUDGETS_MODE` removida de envs/docs

## 9. Testes

### Manual
1. Criar novo orçamento → verificar que é salvo no SurrealDB
2. Editar orçamento (adicionar local, trecho, item) → verificar persistência
3. Selecionar cliente no orçamento → verificar que `ClientSelector` funciona
4. Adicionar produto individual → verificar `ProductSelector`
5. Adicionar grupo de produtos → verificar dialog de grupo com dados reais
6. Preview PDF → verificar que carrega settings do banco
7. Deletar orçamento (quando UI existir) → verificar remoção no banco
8. Listar orçamentos → verificar SSR com dados reais

## 10. Migração / Rollback

- **Migração:** Não há migração de dados. Dados que estavam em localStorage (mock) são descartados. O SurrealDB já contém os dados reais.
- **Rollback:** Reverter o commit. Os arquivos mock são restaurados pelo git.

## 11. Abertos / Fora de Escopo

- **Export DOCX** — spec separada (budget-output)
- **Merge PDF + Manuais** — spec separada (budget-output)
- **Upload de imagem no rich text** — spec separada
- **Cleanup de arquivos ao deletar produto** — TODO existente em product-actions.ts:371 (spec separada)
- **UI para deletar orçamento** — pode ser adicionada nesta spec se desejado, ou em spec separada
- **Testes automatizados (E2E/integração)** — fora do escopo desta entrega

## Checklist Rápido

- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (UI e Dados) definidas?
- [x] Fluxos de erro cobertos?
- [x] Guardrails de segurança e performance verificados?
- [x] Critérios de aceite cobrem happy path e edge cases?
