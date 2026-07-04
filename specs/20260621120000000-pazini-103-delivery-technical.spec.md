# PAZINI-103 — Entrega Técnica e Catálogo de Equipamentos

**Branch sugerida:** `PAZINI-103`  
**Status:** Em implementação (Fase 1 + DataBook PDF)  
**Referências:** `20260131120000000-budget-workspace.spec.md`, memorial C.Vale OB.26.419

## 1. Objetivo

Após **aprovação do orçamento**, permitir documentar a instalação em campo e montar o **pacote técnico de entrega** (fotos, equipamentos com manual, checklist por área), separado do compositor comercial.

## 2. Escopo Fase 1 (MVP)

### Dentro

- **Catálogo de Equipamentos Técnicos** (`technical_equipment`): fabricante, modelo, categoria, manual PDF, ficha/certificado opcional.
- **Cadastro de DataBooks** (`databook_template`): modelos reutilizáveis com áreas AD, checklist e memorial PDF de referência.
- **Projeto de Entrega** (`delivery_project`): criado a partir de orçamento `approved`, 1:1 por orçamento, vinculado a um DataBook.
- **Áreas** (`delivery_area`): copiadas do DataBook escolhido; checklist editável no projeto.
- **Evidências** (`delivery_evidence`): fotos/documentos por área.
- **Instalações** (`delivery_installation`): vínculo área ↔ equipamento técnico + TAG + quantidade.
- **Export ZIP** com índice HTML, fotos, manuais, memorial de referência do DataBook, `equipamentos.csv` e **DataBook PDF formatado** (`databook/entrega-tecnica.pdf`).
- **DataBook PDF** gerado pelo sistema (capa, sumário AD, checklist, equipamentos e fotos por área) — botão *Gerar DataBook PDF* no workspace; rota `/api/delivery-projects/[id]/pdf`.
- Menus: Equip. técnicos, **DataBooks**, Entrega técnica.
- Botão no orçamento aprovado: escolher DataBook e criar projeto.

### Fora (fases futuras)

- RDO periódico com lembretes
- Import automático de memorial PDF → checklist
- Portal read-only para cliente

## 3. Modelo de dados

| Tabela | Descrição |
|--------|-----------|
| `technical_equipment` | Catálogo técnico com manual |
| `databook_template` | Modelo de entrega (áreas + checklist + PDF referência) |
| `delivery_project` | Projeto pós-aprovação (`budget_id` único; `databook_template_id`) |
| `delivery_area` | Área AD com checklist JSON (cópia do DataBook) |
| `delivery_evidence` | Arquivo/foto vinculado à área |
| `delivery_installation` | Equipamento instalado na área |

## 4. Fluxo

```
Cadastrar DataBook (áreas + checklist)
        ↓
budget.status = approved → escolher DataBook
        ↓
createDeliveryProjectFromBudgetAction(budgetId, databookTemplateId)
        ↓
equipe preenche checklist, fotos, instalações
        ↓
export ZIP (inclui memorial de referência do DataBook + PDF formatado)
```

**Seed:** na primeira listagem de DataBooks, cria automaticamente o modelo **C.Vale — Adequação NR-12 / NR-35** (AD-01…AD-12) como padrão e, se existir `laudos tecnicos.pdf` na raiz do repositório, anexa como memorial de referência.

**Busca:** listagem em `/dashboard/databooks` com filtro por nome, cliente ou descrição.

**Import manual:** na aba Memorial, botão *Importar laudos tecnicos.pdf* copia o PDF do repositório para o DataBook.

## 5. Rotas

| Rota | Função |
|------|--------|
| `/dashboard/technical-equipment` | Lista equipamentos |
| `/dashboard/technical-equipment/new` | Novo equipamento |
| `/dashboard/technical-equipment/[id]` | Editar |
| `/dashboard/databooks` | Lista DataBooks |
| `/dashboard/databooks/new` | Novo DataBook |
| `/dashboard/databooks/[id]` | Editar áreas / memorial |
| `/delivery-projects` | Lista projetos |
| `/delivery-projects/[id]` | Workspace do projeto |
| `/api/delivery-projects/[id]/pdf` | DataBook PDF formatado (inline) |
| `/api/delivery-projects/[id]/export` | Pacote ZIP |

## 6. Critérios de aceite MVP

- [x] CRUD equipamento técnico com upload de manual PDF
- [x] CRUD DataBook com áreas, checklist e PDF de referência
- [x] Criar projeto só com orçamento aprovado; escolha de DataBook
- [x] Áreas copiadas do DataBook; checklist editável no projeto
- [x] Upload de evidências por área
- [x] Vincular equipamento técnico à área
- [x] Export ZIP com estrutura organizada
- [x] DataBook PDF formatado (capa, sumário, áreas AD, checklist, equipamentos, fotos)
- [x] Isolamento por `tenant_id`
