# PLAN-proposal-system-revision.md

> **Status:** REVIEW_NEEDED
> **Owner:** User
> **Date:** 2026-01-30

## 1. Contexto e Objetivos

O sistema atual de geração de propostas e edição de orçamentos falha em oferecer a fluidez e a fidelidade visual necessárias. A pedido do usuário, faremos uma **revisão completa** focada em três pilares, usando como referência obrigatória o arquivo `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`.

**Pilares da Revisão:**
1.  **Editor de Orçamento (Hierárquico e Livre):** Cadastro fluido de Locais > Trechos > Itens sem excesso de modais.
2.  **Compositor Visual (Cena):** Drag-and-drop de produtos para dentro da foto do ambiente (Stickers/Ícones) + Anotações.
3.  **Geração de Proposta (PDF Fiel):** Template "pixel-perfect" baseado no modelo PDF, com dados dinâmicos.

## 2. Especificações Funcionais (Macro)

### 2.1. Editor Hierárquico "Free Flow"
*   **Objetivo:** Eliminar a burocracia de criação. O usuário deve se sentir "preenchendo uma estrutura" e não "navegando em telas".
*   **Fluxo Proposto:**
    *   Visualização em Árvore/Acordeão expandido.
    *   **Local:** Criação rápida (ex: Enter para salvar). Botão de Upload de Foto Principal do Local/Trecho visível imediatamente.
    *   **Trecho:** Subdivisão do local.
    *   **Itens:** Tabela editável dentro do trecho (Produto, Qtde, Valor). Nada de dialogs complexos para adição simples.

### 2.2. Compositor Visual (Scene Builder)
*   **Mudança Chave:** Transformar o anotador em um "Compositor de Cena".
*   **Funcionalidade:**
    *   Ao abrir a foto do ambiente, exibir uma **Dock Lateral** com os produtos cadastrados naquele trecho.
    *   **Drag & Drop:** Arrastar o produto da dock para a foto.
    *   **Resultado:** O produto aparece como um "Sticker" (recorte/ícone) na foto.
    *   **Anotação:** Poder puxar uma seta desse Sticker para explicar detalhes.
    *   **Persistência:** Salvar coordenadas e escala desses stickers na imagem composta.

### 2.3. PDF Pixel-Perfect (Modelo Pazini)
*   **Referência:** `refs/pazini-v1/docs/proposta-comercial-base-de-exemplo.pdf`
*   **Estrutura Obrigatória:**
    1.  **Capa:** Imagem full-bleed, Logo, Título, Infos Cliente.
    2.  **Apresentação:** Textos institucionais (editáveis).
    3.  **Ambientes (O Coração):**
        *   Título do Ambiente.
        *   **Imagem Composta Grande** (A foto com os stickers e anotações).
        *   Tabela de Itens descritiva logo abaixo.
    4.  **Resumo de Investimento:** Totalizadores.
    5.  **Condições e Assinatura:** Textos legais e áreas de assinatura.

## 3. Plano de Execução (Fases)

Para garantir qualidade, **não escreveremos código** antes de validar as specs detalhadas.

### FASE 1: Especificação Detalhada (SDD)
> *Objetivo: Definir "O Que" e "Como" antes do código.*
1.  **Criar `specs/SDD-editor-compositor.md`**:
    *   Detalhar a UI do Editor Hierárquico.
    *   Detalhar o funcionamento técnico do Konva para Stickers de Produtos (Drag&Drop, Layers).
2.  **Criar `specs/SDD-pdf-engine.md`**:
    *   Mapear cada seção do PDF de exemplo.
    *   Definir quais campos são fixos vs dinâmicos.
    *   Definir tecnologia de geração (React-PDF vs HTML-to-Print).

### FASE 2: Backend & Dados
> *Objetivo: Preparar o terreno.*
1.  **Schema Update**: Verificar suporte para Stickers (`image_annotation` precisa de `type: 'sticker'`, `product_image_url`, etc).
2.  **Settings**: Criar tabela/store para textos institucionais globais (Termos, Intro).

### FASE 3: Frontend - Editor & Compositor
> *Objetivo: Experiência de uso.*
1.  Reconstruir `BudgetEditor` com foco em UX Hierárquica.
2.  Atualizar `AdvancedImageAnnotator` para suportar `ProductStickers` (Konva Images arrastáveis).

### FASE 4: Engine de PDF
> *Objetivo: Saída final.*
1.  Implementar o gerador seguindo estritamente o design visual do PDF modelo.
2.  Testar com casos reais (muitos itens, quebra de página, imagens verticais/horizontais).

## 4. Próximos Passos do Usuário

1.  **Revisão**: Confirme se este plano macro cobre suas dores.
2.  **Aprovação**: Autorize o início da **FASE 1 (Specs)**.
3.  **Execução**: O agente criará os arquivos SDD para sua aprovação final antes de codar.

---
**Status:** Aguardando Aprovação para iniciar Fase 1.
