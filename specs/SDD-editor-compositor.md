# SDD-editor-compositor.md

> **Status:** DRAFT
> **Feature:** Editor de Orçamento 2.0 & Compositor Visual
> **Epic:** Revisão do Sistema de Propostas

## 1. Visão Geral
Este documento especifica a reformulação da interface de edição de orçamentos e a introdução do "Compositor Visual". O objetivo é transformar o processo burocrático de cadastro em uma experiência fluida de design e composição.

## 2. Editor Hierárquico "Free Flow"

### 2.1. Conceito de Interface
Abandonar a navegação baseada em Modais Bloqueantes para ações repetitivas. Adotar uma interface de **Lista Expandida Editável**.

**Layout:**
*   **Header:** Infos do Orçamento (Cliente, TOTAL FLUTUANTE sempre visível).
*   **Corpo:** Lista de Locais (Acordeões abertos por padrão ou Toggle All).
    *   **Local Header:** Nome do Local (input inline) + Botões de Ação Rápida (Foto, +Trecho, Excluir).
    *   **Área de Trechos:**
        *   **Trecho Card:**
            *   Header: Nome do Trecho.
            *   **Área de Composição (Miniatura):** Mostra a foto do ambiente (composta). Se vazia, dropzone grande "Arraste foto do ambiente aqui".
            *   **Lista de Itens:** Tabela simplificada abaixo da foto.
                *   Colunas: Produto (Busca inteligente), Qtde, Unit, Total, Ações.
                *   Footer da Tabela: Linha de inserção rápida (ex: Última linha é inputs vazios, ao preencher cria novo).

### 2.2. Comportamentos de UX
1.  **Criação Rápida:** Ao terminar de preencher um item e dar Enter, cria a linha e foca na próxima.
2.  **Drag & Drop Estrutural:** Permitir reordenar Itens dentro do Trecho, e Trechos dentro do Local.
3.  **Upload Direto:** Arrastar arquivo de imagem direto para o Card do Trecho faz upload da foto do ambiente.

## 3. Compositor Visual (Scene Builder)

### 3.1. Definição
O antigo "Anotador" evolui para um "Compositor". Ele é aberto ao clicar na foto do ambiente no Trecho.

### 3.2. Interface do Compositor
*   **Canvas Central (Konva):** A foto do ambiente ocupa o centro.
*   **Dock Lateral (Produtos):** Lista vertical de "Stickers" (miniaturas) dos produtos cadastrados naquele trecho.
*   **Toolbar Superior:** Ferramentas de desenho (Seta, Texto, Retângulo, Zoom).

### 3.3. Fluxo de Composição
1.  **População:** O sistema carrega a lista de itens do trecho na Dock Lateral.
2.  **Drag-and-Drop:** O usuário arrasta um produto da Dock para o Canvas.
3.  **Instanciação:**
    *   O sistema cria um nó `Konva.Image` no Canvas com a foto do produto.
    *   Se o produto não tiver foto, gera um "Placeholder Sticker" (Retângulo com Nome do Produto).
4.  **Manipulação:**
    *   Sticker pode ser movido, redimensionado e rotacionado.
    *   Sticker possui "pontos de ancoragem" para setas.
5.  **Anotação Conectada:**
    *   Ao desenhar uma Seta, se o início/fim for próximo a um Sticker, cria um **Vínculo Lógico**.
    *   (Futuro: Mover o sticker move a ponta da seta junto).

### 3.4. Persistência de Dados (Schema Update)

**Tabela `image_annotation`:**
Precisa suportar o novo tipo `product_sticker`.

```typescript
type AnnotationType = 'arrow' | 'rect' | 'text' | 'step_number' | 'product_sticker';

interface ImageAnnotation {
    // ... campos base
    tool_type: AnnotationType;
    
    // Campos específicos para Sticker
    product_item_id?: string; // ID do Item do orçamento que gerou este sticker
    image_url?: string; // URL da imagem do produto (cache visual)
    
    // Geometria (x, y, scale, rotation)
    geometry: {
        x: number;
        y: number;
        width: number;
        height: number;
        rotation?: number;
    }
}
```

### 3.5. Output de Imagem
*   **Composed Image:** Ao salvar, o sistema gera um PNG *flattened* (Ambiente + Stickers + Anotações) em alta resolução. Esta é a imagem que vai para o PDF.

## 4. Requisitos Técnicos Frontend
*   **Lib:** `react-konva` (já em uso).
*   **State:** Gerenciamento robusto de array de `annotations`.
*   **Upload:** Migrar para serviço de storage real (S3/MinIO) para evitar payload base64 gigante no banco. **(Ação Crítica)**.

## 5. Critérios de Aceite
1.  Consigo cadastrar um orçamento completo sem abrir maiss de 2 modais (apenas para configurações avançadas).
2.  Consigo arrastar a foto de uma "Torneira" para cima da foto da "Pia" no Compositor.
3.  A imagem salva no final mostra a Torneira em cima da Pia.
