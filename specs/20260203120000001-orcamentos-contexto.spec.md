# 20260203120000001 - Contexto do Domínio Orçamentos

Esta especificação formaliza o contexto e requisitos de negócio do domínio de orçamentos, conforme documentação original do projeto.

## 1. Contexto e Objetivo

### 1.1 Contexto
- **Sistema:** Gerador de orçamentos de adequação de segurança para empresa de engenharia mecânica.
- **Modelo de referência:** `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`
- **Escopo:** Orçamentos viram propostas comerciais com anotações visuais, exportáveis em PDF, DOCX e impressão.

### 1.2 Objetivo
- Preservar áreas do orçamento com texto rico editável.
- Dinamizar produtos, valores e segmentação por **Locais > Trechos > Itens**.
- Telas devem refletir a hierarquia e numeração coerente com o template.

### 1.3 Escopo
- **Dentro:** Hierarquia Locais → Trechos → Itens; numeração automática; cliente; templates; anotações visuais; exportação.
- **Fora:** Outros domínios do sistema (produtos, clientes, autenticação).

---

## 2. Requisitos Funcionais

### 2.1 Numeração Automática
- Campo "Proposta Comercial" com numeração sequencial automática.
- Formato: `Proposta Comercial - {SEQ}` (ex: `Proposta Comercial - 00001`).
- Regra: Contar orçamentos existentes + 1; preencher automaticamente ao criar.

### 2.2 Campo Cliente
- Exibir cliente no formato: **Nome - Cidade - CNPJ**.
- Exemplo: `C-Vale - Ponta Grossa - 123.456.789/0001-90`.

### 2.3 Hierarquia
- **Locais:** Ambientes/áreas (ex: Galpão Principal).
- **Trechos:** Subdivisões do local (ex: Linha de Montagem).
- **Itens:** Produtos com quantidade em cada trecho.
- Numeração coerente com itens do template.

### 2.4 Anotações Visuais
- Área pode ter imagem geral com anotações (setas, marcações de produtos, texto).
- Anotações geram composição da imagem para o documento final.

### 2.5 Exportação
- PDF, DOCX (Word/Google Docs), impressão.
- Manter formatação e conteúdo.
- Visualizador web responsivo.

### 2.6 Anexos de Produtos
- Produtos podem ter anexos (manuais técnicos).
- Ao imprimir orçamento, anexos devem ser incluídos como anexos da proposta.

---

## 3. Contratos e Interfaces

### 3.1 Rotas
- Listagem: `/budgets`
- Criação: `/budgets/new` → redireciona para `/budgets/budget/[id]`
- Edição: `/budgets/budget/[id]`
- PDF: `/budgets/budget/[id]/pdf`

### 3.2 Estrutura de Dados
- Orçamento → N Locais
- Local → N Trechos
- Trecho → N Itens (produto + quantidade)
- Trecho → N Imagens (com anotações)

---

## 4. Referências

### 4.1 Specs Relacionadas
- `20260129165500001-budget-structure.spec.md` - Estrutura e CRUD
- `20260129170500000-budget-annotations.spec.md` - Anotações visuais
- `20260129171000000-budget-output.spec.md` - Exportação
- `20260131120000000-budget-workspace.spec.md` - Workspace unificado

### 4.2 Templates Futuros
- No momento: um template (empresa atual).
- Futuro: múltiplos clientes com templates próprios; sistema deve suportar gerenciamento de templates.

---

## 5. Critérios de Aceite

- [x] Numeração automática "Proposta Comercial - XXXXX" implementada
- [x] Cliente exibido no formato Nome - Cidade - CNPJ
- [x] Hierarquia Locais > Trechos > Itens funcional
- [x] Anotações visuais em imagens
- [x] Exportação PDF e impressão
- [ ] Exportação DOCX
- [ ] Anexos de manuais técnicos na impressão

---

## 6. Abertos / Fora de Escopo

- Gerenciamento de múltiplos templates por cliente (futuro)
- Integração com ERPs

## Checklist Rápido

- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (UI e Dados) definidas?
- [x] Referências às specs relacionadas?
