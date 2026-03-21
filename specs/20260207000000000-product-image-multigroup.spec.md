# Spec: Melhorias em Produtos - Imagem e Multi-Grupo

**ID:** 20260207000000000-product-image-multigroup
**Status:** Em implementacao
**Prioridade:** Alta

## Objetivo

Melhorar a experiencia de imagens de produto e permitir que um produto pertenca a multiplos grupos simultaneamente.

## Requisitos

### RF-01: Imagem de capa maior no formulario
- A imagem de capa no formulario de criacao/edicao deve ser exibida em 320x320px (antes era 160x160px)
- Manter `object-cover` e `fill`

### RF-02: Thumbnail na listagem desktop
- Adicionar coluna "Imagem" como primeira coluna da tabela de produtos
- Thumbnail de 48x48px com `rounded-md`, `object-cover`
- Fallback: icone placeholder cinza quando sem imagem
- Usar `next/image` com `sizes="48px"`

### RF-03: Thumbnail no card mobile
- Adicionar thumbnail 48x48px ao lado esquerdo do header do card mobile
- Mesmo fallback do desktop

### RF-04: Multi-grupo por produto
- Um produto pode pertencer a 0 ou mais grupos
- Campo `group_id` (single) migra para `group_ids` (array)
- Seletor de grupo usa checkboxes para multi-selecao
- Manter funcionalidade de criar novo grupo inline

### RF-05: Migracao de dados
- Produtos existentes com `group_id` devem ser convertidos para `group_ids: [group_id]`
- Produtos sem grupo recebem `group_ids: []`
- Campo `group_id` removido apos migracao

### RF-06: Compatibilidade com orcamentos
- `getProductGroupProductsAction` deve buscar produtos onde `group_ids CONTAINS $groupId`
- Dialogo de adicionar grupo ao orcamento continua funcionando sem alteracao visual

## Arquivos Impactados

| Arquivo | Mudanca |
|---------|---------|
| `components/products/image-upload.tsx` | Imagem 320px |
| `components/products/products-table.tsx` | Coluna thumbnail |
| `components/products/product-card.tsx` | Thumbnail no card |
| `actions/product-actions.ts` | `group_id` -> `group_ids[]` |
| `actions/product-group-actions.ts` | Query CONTAINS |
| `components/products/product-group-selector.tsx` | Checkboxes multi-select |
| `components/products/product-form.tsx` | Array de grupos + hidden input |
| `lib/budgets/mock-catalog.ts` | Mock com `group_ids[]` |

## Criterios de Aceite

1. Imagem no form exibida em 320x320px
2. Thumbnail visivel na tabela desktop e card mobile
3. Produto pode ser associado a multiplos grupos via checkboxes
4. Dados salvos e recuperados corretamente com array de grupos
5. Orcamentos continuam listando produtos por grupo corretamente
6. Migracao converte dados existentes sem perda
