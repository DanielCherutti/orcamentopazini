# Spec: Bloco Cabeçalho e Rodapé no Compositor

**ID:** 20260511235500000
**Status:** Implementado
**Data:** 2026-05-11
**Prioridade:** Alta

---

## 1. Contexto e Objetivo

Hoje os ajustes de cabeçalho e rodapé são feitos por botões e dialogs na capa.

O objetivo é substituir esse fluxo por um bloco dedicado no compositor, posicionado entre CAPA e SUMÁRIO, com edição visual em formato de folha para:

- Cabeçalho e rodapé da capa
- Cabeçalho e rodapé das páginas internas
- Ajuste de altura do rodapé/cabeçalho sem depender de presets fixos

---

## 2. Requisitos Funcionais

### RF-01 — Novo bloco fixo na raiz

- Criar bloco fixo `header_footer` na raiz.
- Label fixo: `CABEÇALHO E RODAPÉ`.
- Deve aparecer entre `CAPA` e `SUMÁRIO`.
- Não pode ter filhos, ser removido, nem sair da raiz.

### RF-02 — Editor visual com duas abas

- O bloco deve renderizar uma tela de edição com duas abas:
  - `Capa`
  - `Páginas internas`
- Cada aba deve permitir editar:
  - HTML do cabeçalho
  - HTML do rodapé
  - altura do cabeçalho
  - altura do rodapé

### RF-03 — Remoção dos botões antigos na capa

- Remover da capa o botão de configuração de cabeçalho/rodapé PDF.
- Remover o dialog antigo de cabeçalho/rodapé da capa do fluxo principal.

### RF-04 — Migração de dados existentes

- Ao criar o bloco em orçamentos existentes, migrar os campos antigos de capa para props legadas do novo bloco.
- Em caso de ausência de HTML novo, usar fallback legado para manter compatibilidade de saída no PDF.

### RF-05 — Aplicação no PDF

- Capa: cabeçalho/rodapé devem usar os dados do novo bloco (com fallback legado quando necessário).
- Páginas internas: cabeçalho/rodapé devem usar os dados do novo bloco (com fallback do comportamento anterior quando necessário).

---

## 3. Fora de Escopo

- Editor WYSIWYG com posicionamento livre por coordenadas.
- Múltiplos templates de cabeçalho/rodapé por seção.
- Regras condicionais por página específica.

---

## 4. Arquivos impactados

- `front/src/types/budget-compositor-types.ts`
- `front/src/actions/budget-compositor-block-actions.ts`
- `front/src/actions/budget-compositor-tree-actions.ts`
- `front/src/actions/budget-core-write-actions.ts`
- `front/src/lib/budgets/budget-pdf-payload.ts`
- `front/src/lib/pdf/sanitize-inline-styles-for-pdf.ts`
- `front/src/components/budgets/compositor/compositor-sidebar.tsx`
- `front/src/components/budgets/compositor/compositor-block-tree.tsx`
- `front/src/components/budgets/compositor/compositor-cover-block.tsx`
- `front/src/components/pdf/proposal-document.tsx`

---

## 5. Abertos / Fora de Escopo

- Evolução futura para régua e layout por zonas arrastáveis no estilo Word completo.

---

## 6. Checklist

- [x] Bloco fixo `header_footer` criado e garantido na raiz
- [x] Editor com abas Capa/Páginas internas implementado
- [x] Botões antigos de cabeçalho/rodapé removidos da capa
- [x] Migração/fallback legado implementados
- [x] PDF da capa e páginas internas consumindo o novo bloco
- [x] Compatibilidade preservada em orçamentos antigos
