# PLAN-budget-form-ui.md - Budget Creation Form Redesign

> Created by @project-planner based on user feedback.

## 1. Objective
Redesign `/budgets/new` to be a comprehensive, "single-screen" form that looks like a professional proposal creation step. It must include both functional fields (connected to DB) and mock fields (for UI completeness) as requested.

## 2. UI Layout Strategy
Instead of a small centered card, use a full-width or large container layout "Standard Form" pattern.

### 2.1 Fields Specification

| Field Label | Type | Status | Tech |
|-------------|------|--------|------|
| **Título do Orçamento** | Input (Text) | ✅ Functional | `zod.string` |
| **Cliente** | Select (Async) | ✅ Functional | `ClientSelector` |
| **Data da Emissão** | DatePicker | 🚧 Mock | `shadcn/ui popover+calendar` |
| **Validade da Proposta** | Input (Number + Select) | 🚧 Mock | Input "15" + Select "Dias" |
| **Prazo de Entrega** | Input (Text) | 🚧 Mock | Input "Ex: 10 dias úteis" |
| **Condições de Pagamento** | Textarea/Select | 🚧 Mock | Select "30/60/90 dias" |
| **Descrição / Objeto** | Textarea (Large) | ✅ Functional | `Textarea` (maps to description) |

### 2.2 Visual Structure
- **Header**: "Novo Orçamento" with breadcrumbs.
- **Section 1: Dados Principais** (Grid 2 cols)
  - Título (Full width)
  - Cliente (Col 1)
  - Data Emissão (Col 2 - Mock)
- **Section 2: Condições Comerciais** (Grid 3 cols) - *All Mocks*
  - Validade
  - Entrega
  - Pagamento
- **Section 3: Detalhamento**
  - Descrição Completa (Textarea)
- **Footer**:
  - Cancelar (Secondary)
  - Criar Rascunho (Primary)

## 3. Implementation Steps

1.  **Scaffold UI Components**:
    - Ensure `Textarea`, `Popover`, `Calendar` (date-fns) are available.
2.  **Update Zod Schema**:
    - Add mock fields to `createBudgetSchema` as optional (or required but ignored by backend action).
3.  **Rewrite `NewBudgetPage`**:
    - Replace small generic Card with the Layout defined in 2.2.
    - Integrate `ClientSelector`.
4.  **Backend Integration**:
    - Pass `title`, `client_id`, `description` to `createBudgetAction`.
    - Ignore mock fields for now (visual only).

## 4. Verification
- [ ] UI looks "heavy" and professional (not empty).
- [ ] Client Selector works.
- [ ] Submission creates budget and redirects correctly.
