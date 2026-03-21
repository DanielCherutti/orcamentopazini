# 20260203140000000 - Galeria de Imagens em Locais e Trechos

Esta especificação define a extensão do sistema de imagens para suportar múltiplas fotos com composição (anotações) tanto em **Locais** quanto em **Trechos**, incluindo interface de galeria.

## 1. Contexto e Objetivo

### 1.1 Contexto
- **Situação atual:** Imagens existem apenas em Trechos (`budget_image.section_id`); cada trecho exibe uma única imagem principal; Locais não possuem imagens.
- **Necessidade:** Engenheiros precisam documentar visualmente tanto o ambiente inteiro (Local) quanto detalhes específicos (Trecho), com múltiplas fotos por contexto e anotações em cada uma.

### 1.2 Objetivo
- Permitir **múltiplas imagens** por Local e por Trecho.
- Cada imagem pode ter **composição** (anotações visuais estilo Screenpresso).
- Interface em formato de **galeria** para visualização e gerenciamento.
- Reutilizar o motor de anotações existente (`20260129170500000-budget-annotations.spec.md`).

### 1.3 Escopo
- **Dentro:** Extensão do modelo de dados; galeria em Local e Trecho; upload múltiplo; ordenação; exclusão individual.
- **Fora:** Alterações no motor de anotações; geração de PDF (consumirá as imagens conforme já especificado).

---

## 2. Requisitos Funcionais

### 2.1 Imagens no Local
- **Adicionar imagem:** Botão "Adicionar Foto" no cabeçalho ou área dedicada do Local.
- **Upload:** Mesmo fluxo do Trecho (upload → modal de anotação → salvar).
- **Múltiplas imagens:** Local pode ter N imagens (ex.: vista geral do galpão, entrada, área de máquinas).
- **Composição:** Cada imagem pode receber anotações (setas, números, texto).
- **Vínculo a itens:** No contexto de Local, anotações podem vincular-se a itens de qualquer trecho filho (ou ficar sem vínculo).

### 2.2 Imagens no Trecho
- **Múltiplas imagens:** Trecho pode ter N imagens (atualmente exibe apenas a primeira).
- **Galeria:** Exibir todas as imagens em formato galeria (grid ou carrossel).
- **Composição:** Cada imagem mantém anotações independentes; vínculo a itens do próprio trecho.
- **Ordenação:** Imagens possuem `order_index` para controle de exibição.

### 2.3 Galeria
- **Layout:** Grid responsivo (ex.: 2–4 colunas em desktop, 1–2 em mobile).
- **Thumbnail:** Cada item mostra preview (composed_url ou url).
- **Ações por imagem:**
  - Clicar para abrir modal de edição/anotação.
  - Botão "Adicionar Cena" para nova imagem.
  - Botão excluir (com confirmação).
- **Estado vazio:** Mensagem "Nenhuma foto. Clique em Adicionar Foto para começar." com CTA.
- **Drag para reordenar:** Opcional (nice-to-have).

### 2.4 Fluxo de Adição
1. Usuário clica "Adicionar Foto".
2. Upload de arquivo (validação: imagem, tamanho máx. 5MB).
3. Modal abre com imagem carregada e ferramentas de anotação.
4. Usuário anota (opcional) e salva.
5. Imagem aparece na galeria; ordem definida por `order_index`.

---

## 3. Contratos e Interfaces

### 3.1 Modelo de Dados

#### Extensão de `budget_image`
A entidade `budget_image` passa a suportar vínculo a **Local** ou **Trecho**:

| Campo        | Tipo                | Obrigatório | Descrição                                      |
|-------------|---------------------|-------------|------------------------------------------------|
| `id`        | record              | Sim         | Identificador único                            |
| `budget_id` | record\<budget\>    | Sim         | Orçamento pai                                  |
| `section_id`| record\<budget_section\> | Não    | Trecho (quando imagem pertence ao trecho)      |
| `location_id`| record\<budget_location\> | Não   | Local (quando imagem pertence ao local)       |
| `url`       | string              | Sim         | URL da imagem original                         |
| `composed_url`| string            | Não         | URL da imagem com anotações "queimadas"       |
| `width`     | number              | Sim         | Largura em px                                  |
| `height`    | number              | Sim         | Altura em px                                   |
| `order_index`| number             | Sim         | Ordem de exibição na galeria (default: 0)      |
| `created_at`| datetime            | Sim         | Data de criação                                |

**Regra de integridade:** Exatamente um de `section_id` ou `location_id` deve ser preenchido.

### 3.2 Server Actions

#### Novas/alteradas
- `saveBudgetImageWithAnnotations(params)` — Estender para aceitar `locationId` em vez de `sectionId` quando aplicável.
- `getBudgetImages(budgetId, filters?)` — Ou manter `getBudgetImagesBySection(sectionId)` e adicionar `getBudgetImagesByLocation(locationId)`.
- `deleteBudgetImage(imageId, budgetId)` — Excluir imagem e suas anotações em cascata.
- `reorderBudgetImages(imageIds: string[])` — Atualizar `order_index` (opcional).

#### Assinaturas
```typescript
// Salvar imagem (local ou trecho)
saveBudgetImageWithAnnotations(params: {
  budgetId: string;
  sectionId?: string;   // Um dos dois obrigatório
  locationId?: string;
  url: string;
  composedUrl?: string;
  width: number;
  height: number;
  annotations: ImageAnnotation[];
}) => Promise<{ success: boolean; imageId?: string; error?: string }>

// Listar imagens de um trecho
getBudgetImagesBySection(sectionId: string) => Promise<BudgetImage[]>

// Listar imagens de um local
getBudgetImagesByLocation(locationId: string) => Promise<BudgetImage[]>

// Excluir imagem
deleteBudgetImage(imageId: string, budgetId: string) => Promise<{ success: boolean; error?: string }>
```

### 3.3 Componentes de UI

| Componente | Descrição |
|------------|-----------|
| `BudgetImageGallery` | Galeria de imagens (grid); recebe lista de imagens, callbacks para adicionar, editar, excluir. |
| `BudgetPhotoAnnotatorDialog` | Já existe; estender para aceitar `locationId` além de `sectionId`; `availableItems` pode vir vazio para Local (ou lista de itens de todos os trechos do local). |
| Integração em `LocationDetailPanel` | Área de galeria no topo do painel do Local (acima dos trechos). |
| Integração em `SectionSceneCard` | Substituir exibição de imagem única por `BudgetImageGallery`. |

---

## 4. Fluxos e Estados

### 4.1 Fluxo Feliz – Adicionar Imagem no Local
1. Usuário seleciona Local na sidebar.
2. No painel direito, vê área "Fotos do Ambiente" com galeria vazia ou imagens existentes.
3. Clica "Adicionar Foto".
4. Seleciona arquivo de imagem.
5. Modal de anotação abre com imagem carregada.
6. (Opcional) Adiciona setas, números, texto.
7. Clica "Salvar".
8. Imagem aparece na galeria; toast de sucesso.

### 4.2 Fluxo Feliz – Adicionar Imagem no Trecho
1. Usuário expande/visualiza Trecho no painel.
2. Vê galeria de imagens do trecho (pode estar vazia).
3. Clica "Adicionar Cena" ou "Adicionar Foto".
4. Mesmo fluxo de upload e anotação.
5. Imagem aparece na galeria do trecho.

### 4.3 Estados Alternativos
- **Upload falha:** Toast de erro; usuário pode tentar novamente.
- **Imagem muito grande:** Validação no cliente e servidor; mensagem "Arquivo excede 5MB".
- **Formato inválido:** Aceitar apenas JPG, PNG, WEBP; mensagem clara.
- **Exclusão:** Confirmação "Excluir esta foto e suas anotações?" antes de remover.

### 4.4 Cascata de Exclusão
- Ao excluir **Local:** Excluir imagens do local e de todos os trechos filhos.
- Ao excluir **Trecho:** Excluir apenas imagens do trecho (já implementado).

---

## 5. Dados

### 5.1 Migração de Schema
- Adicionar campo `location_id` em `budget_image` (opcional).
- Adicionar campo `order_index` em `budget_image` (default 0).
- Garantir que imagens existentes (com `section_id`) continuem válidas.
- Índices para consulta: `section_id`, `location_id`.

### 5.2 Validação
- Ao criar `budget_image`: exatamente um de `section_id` ou `location_id` preenchido.
- `order_index` inteiro não negativo.
- Tamanho máximo de upload: 5MB.

---

## 6. NFRs (Não Funcionais)

### 6.1 Desempenho
- Galeria com lazy loading de thumbnails quando muitas imagens.
- Upload em background; feedback imediato (progress opcional).

### 6.2 UX
- Galeria responsiva; touch-friendly em mobile.
- Transições suaves ao adicionar/remover imagens.

### 6.3 Segurança
- Validação de tipo e tamanho no servidor.
- Sanitização de metadados; não executar conteúdo de imagem.

---

## 7. Guardrails

- Reutilizar `BudgetPhotoAnnotatorDialog` e motor de anotações existente.
- Seguir padrões de `01-design-system.spec.md`.
- Não adicionar novas dependências pesadas para galeria (CSS Grid ou flexbox suficientes).

---

## 8. Critérios de Aceite

- [x] Local exibe galeria de imagens com botão "Adicionar Foto".
- [x] Trecho exibe galeria de imagens (múltiplas) com botão "Adicionar Cena".
- [x] Cada imagem pode ser editada (anotações) via modal existente.
- [x] Cada imagem pode ser excluída individualmente (com confirmação).
- [x] Imagens são ordenadas por `order_index`.
- [x] Upload valida tipo (JPG/PNG/WEBP) e tamanho (≤5MB).
- [x] Ao excluir Local, imagens do local e dos trechos são removidas.
- [x] Ao excluir Trecho, imagens do trecho são removidas.
- [x] Galeria responsiva (grid adaptável).
- [x] Estado vazio exibe mensagem e CTA.

---

## 9. Migração / Rollback

### 9.1 Migração
- Script SQL para adicionar `location_id` e `order_index` em `budget_image`.
- Imagens existentes: `order_index = 0`; `location_id = null`.

### 9.2 Rollback
- Remover campo `location_id` (imagens de local seriam perdidas).
- Manter `order_index` com default 0 (retrocompatível).

---

## 10. Referências

### 10.1 Specs Relacionadas
- `20260129170500000-budget-annotations.spec.md` — Motor de anotações.
- `20260129165500001-budget-structure.spec.md` — Estrutura de dados.
- `20260131120000000-budget-workspace.spec.md` — Workspace e layout.

### 10.2 Dependências
- `BudgetPhotoAnnotatorDialog` deve aceitar `locationId` opcional.
- Query de orçamento completo deve incluir imagens de locais e trechos.

---

## 11. Abertos / Fora de Escopo

- Drag-and-drop para reordenar imagens na galeria (nice-to-have).
- Legendas ou títulos por imagem.
- Compressão automática de imagens no servidor.
- Inserção de imagens de Local no PDF (definir na spec de output).

---

## Checklist Rápido

- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (modelo de dados, Server Actions, componentes) definidas?
- [x] Fluxos de erro e cascata de exclusão cobertos?
- [x] Migração de schema planejada?
- [x] Critérios de aceite cobrem Local, Trecho e galeria?
