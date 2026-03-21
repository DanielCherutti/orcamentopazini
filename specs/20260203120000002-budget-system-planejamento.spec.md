# 20260203120000002 - Planejamento do Módulo de Orçamentos

Esta especificação documenta a estratégia de quebra do domínio Orçamentos em specs focais e o roteiro de execução.

## 1. Contexto e Objetivo

### 1.1 Contexto
O sistema requer um gerador de orçamentos complexo para adequação de segurança (engenharia mecânica). O fluxo envolve hierarquia detalhada de locais/trechos, anotações visuais em imagens e geração de documentos (PDF/DOCX) baseados em templates.

**Referência:** `20260203120000001-orcamentos-contexto.spec.md` e `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`.

### 1.2 Objetivo
Garantir clareza e manutenibilidade do domínio Orçamentos mediante especificações focais e ordenadas.

---

## 2. Estratégia de Quebra (Domain Driven)

O domínio "Orçamentos" é dividido em especificações focais:

### 2.1 Budget Structure (Estrutura)
**Spec:** `20260129165500001-budget-structure.spec.md`

- **Entidades:** Orçamento, Local, Trecho, Item (Produto + Qty).
- **Funcionalidades:** CRUD de orçamentos; edição da árvore hierárquica; cálculo de valores; versionamento/status.

### 2.2 Budget Annotations (Anotações Visuais)
**Spec:** `20260129170500000-budget-annotations.spec.md`

- **Funcionalidades:** Upload de fotos; canvas para desenho sobre imagem; ferramentas (setas, texto, tags de produtos); persistência de coordenadas; geração de imagem composta.

### 2.3 Budget Output (Template e Exportação)
**Spec:** `20260129171000000-budget-output.spec.md`

- **Funcionalidades:** Sistema de templates; editor de texto rico; engine de variáveis; geração PDF; exportação DOCX; anexação de manuais.

### 2.4 Budget Workspace (Interface Unificada)
**Spec:** `20260131120000000-budget-workspace.spec.md`

- **Funcionalidades:** Tela única para criação e edição; abas (Dados, Ambientes, Preview); layout sidebar + painel.

---

## 3. Ordem de Execução

| Ordem | Spec | Descrição | Status |
|-------|------|-----------|--------|
| 1 | budget-structure | Schemas, server actions e UI da hierarquia | Implementado |
| 2 | budget-annotations | Canvas e armazenamento de mídia | Implementado |
| 3 | budget-output | PDF/DOCX e templates | Parcial |
| 4 | budget-workspace | Interface unificada | Implementado |

---

## 4. Dependências entre Specs

- **budget-structure** é pré-requisito para annotations e output.
- **budget-annotations** fornece imagens compostas para o output.
- **budget-output** consome estrutura e imagens para gerar documentos.
- **budget-workspace** integra todas as funcionalidades na interface.

---

## 5. Critérios de Aceite

- [x] Estratégia de quebra documentada
- [x] Specs focais criadas e referenciadas
- [x] Ordem de execução definida
- [x] Dependências mapeadas

---

## 6. Abertos / Fora de Escopo

- Detalhes de implementação técnica (ver specs individuais)
- Roadmap de evolução do módulo

## Checklist Rápido

- [x] Estratégia de quebra documentada?
- [x] Specs focais referenciadas?
