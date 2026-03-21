# 02 - Padrão de UI para Telas de Listagem

Esta especificação define o padrão obrigatório para **todas as telas de listagem** (index/list) do sistema Pazini, garantindo consistência de UX, performance e acessibilidade.

## 1. Contexto e Objetivo

- **Contexto:** Necessidade de padronizar a experiência de listagem em todo o sistema
- **Objetivo:** Definir componentes, comportamentos e padrões visuais que devem ser replicados em todas as telas de listagem
- **Referência:** Implementação da tela de Produtos (`/dashboard/products`)

## 2. Arquitetura de Componentes

### 2.1 Estrutura Obrigatória

Toda tela de listagem DEVE seguir esta estrutura:

```
Page (Server Component)
├── Header (Título + Botão de Ação)
├── Card Container
│   ├── SearchInput (Client Component)
│   ├── SearchBadge (Client Component)
│   └── DataTable (Client Component)
│       ├── Loading Overlay
│       ├── Desktop Table (md+)
│       ├── Mobile Cards (<md)
│       └── Pagination Controls
```

### 2.2 Separação Server/Client

- **Server Component (Page):** Fetch inicial de dados via Server Action
- **Client Component (DataTable):** Gerencia estado, paginação, ordenação e filtros via AJAX

**Benefícios:**
- ✅ SSR para SEO e performance inicial
- ✅ Navegação sem reload (SPA-like)
- ✅ URL como fonte da verdade

## 3. Funcionalidades Obrigatórias

### 3.1 Busca/Filtro

**Componente:** `SearchInput`
- Campo de busca com debounce (300ms)
- Atualiza URL: `?query=termo`
- Ícone de busca (Search)
- Placeholder descritivo
- Clear button quando há texto

**Comportamento:**
- Ao digitar → debounce → atualiza URL → fetch AJAX
- Reset para página 1 ao buscar
- Badge visual mostrando filtro ativo

### 3.2 Paginação Completa

**Componente:** Inline no DataTable

**Elementos obrigatórios:**
1. **Navegação:**
   - Botão "Primeira" (««)
   - Botão "Anterior" (<)
   - Indicador "Página X de Y"
   - Botão "Próximo" (>)
   - Botão "Última" (»»)

2. **Seletor de Itens:**
   - Dropdown: 10, 20, 50, 100 itens
   - Label: "Itens por página:"
   - Reset para página 1 ao alterar

3. **Informações:**
   - "Mostrando X-Y de Z [entidade]"
   - Atualiza dinamicamente

**Comportamento:**
- URL atualiza: `?page=2&limit=20`
- Botões desabilitados quando não aplicável
- Loading state durante transição
- `scroll: false` no router.push

### 3.3 Ordenação por Colunas

**Implementação:**
- Headers clicáveis (cursor pointer)
- Hover: `bg-muted/50`
- Ícones visuais:
  - Inativo: `<ArrowUpDown />` (opacity 0, aparece no hover)
  - ASC: `<ArrowUp />`
  - DESC: `<ArrowDown />`

**Comportamento:**
- Primeiro clique: ASC
- Segundo clique (mesma coluna): DESC
- Clique em outra coluna: nova coluna ASC
- URL atualiza: `?sortBy=campo&sortOrder=asc`
- Reset para página 1 ao ordenar

**Ordenação Locale-Aware (pt-BR):**
```typescript
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
allItems.sort((a, b) => {
    if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = collator.compare(aValue, bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
    }
    // ... números
});
```

**Colunas ordenáveis:** Todas, exceto "Ações"

### 3.4 Responsividade

**Desktop (≥768px):**
- Tabela completa com todas as colunas
- Headers clicáveis para ordenação
- Hover states

**Mobile (<768px):**
- Cards verticais (componente `EntityCard`)
- Informações principais destacadas
- Botão de ações no card
- Paginação simplificada (sem números de página)

### 3.5 Loading States

**Overlay durante fetch:**
```tsx
{(isLoading || isPending) && (
    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10">
        <Spinner />
        <span>Carregando...</span>
    </div>
)}
```

**Características:**
- Backdrop blur
- Spinner animado
- Texto "Carregando..."
- z-index 10
- Botões desabilitados

### 3.6 Empty States

**Sem dados:**
```
Nenhum [entidade] cadastrado
```

**Busca sem resultados:**
```
Nenhum [entidade] encontrado para "[termo]"
```

## 4. Padrões Técnicos

### 4.1 Server Action

```typescript
export async function getEntitiesAction(params?: {
    page?: number;
    limit?: number;
    query?: string;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
}) {
    // 1. Buscar todos os registros filtrados
    // 2. Ordenar com Intl.Collator (pt-BR)
    // 3. Paginar com slice()
    // 4. Retornar { success, data, meta }
}
```

**Meta obrigatório:**
```typescript
meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
```

### 4.2 Client Component (DataTable)

**Estado:**
```typescript
const [items, setItems] = useState(initialItems);
const [meta, setMeta] = useState(initialMeta);
const [isLoading, setIsLoading] = useState(false);
const isFirstRender = useRef(true);
```

**URL Params:**
```typescript
const query = searchParams.get("query") || "";
const page = Number(searchParams.get("page")) || 1;
const limit = Number(searchParams.get("limit")) || 10;
const sortBy = searchParams.get("sortBy") || "created_at";
const sortOrder = searchParams.get("sortOrder") || "desc";
```

**useEffect:**
```typescript
useEffect(() => {
    if (isFirstRender.current) {
        isFirstRender.current = false;
        return; // Skip first render (SSR data)
    }
    fetchItems(); // AJAX fetch
}, [page, limit, query, sortBy, sortOrder]);
```

### 4.3 Navegação sem Reload

```typescript
const handleAction = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("key", "value");
    
    startTransition(() => {
        router.push(`?${params.toString()}`, { scroll: false });
    });
};
```

## 5. Estilos e Design

### 5.1 Cores e Tipografia

- **Headers:** `text-muted-foreground`, `font-medium`
- **Rows hover:** `hover:bg-muted/20`
- **Borders:** `border-border`
- **Cards:** `bg-card`, `rounded-xl`, `shadow-sm`

### 5.2 Espaçamento

- **Container padding:** `p-6`
- **Gap entre seções:** `space-y-6`
- **Table padding:** `p-4`
- **Button height:** `h-9` (paginação)

### 5.3 Ícones

- **Tamanho padrão:** `h-4 w-4`
- **Ordenação:** `h-3 w-3`
- **Biblioteca:** `lucide-react`

## 6. Acessibilidade

### 6.1 ARIA Labels

```tsx
<button
    aria-label="Primeira página"
    title="Primeira página"
    disabled={currentPage === 1}
>
    ««
</button>
```

### 6.2 Keyboard Navigation

- **Setas (← →):** Navegar páginas (via hook `useKeyboardPagination`)
- **Tab:** Navegar entre controles
- **Enter/Space:** Ativar botões

### 6.3 Screen Readers

- Indicar página atual: `aria-current="page"`
- Descrever ações: `aria-label`
- Ocultar decorativos: `aria-hidden="true"`

## 7. Performance

### 7.1 Otimizações

- ✅ SSR para primeira carga
- ✅ Debounce em busca (300ms)
- ✅ `scroll: false` para evitar scroll jump
- ✅ `useTransition` para transições suaves
- ✅ Paginação no servidor (não carregar tudo)

### 7.2 Limites

- **Máximo de itens por página:** 100
- **Padrão:** 10 itens
- **Timeout de busca:** 5 segundos

## 8. Checklist de Implementação

Ao criar uma nova tela de listagem, verificar:

- [ ] **Estrutura:** Page (Server) + DataTable (Client)
- [ ] **Busca:** SearchInput com debounce e badge
- [ ] **Paginação:** Navegação completa (4 botões + indicador + seletor)
- [ ] **Ordenação:** Headers clicáveis com ícones visuais
- [ ] **Ordenação Locale:** `Intl.Collator('pt-BR')` para strings
- [ ] **Responsivo:** Tabela (desktop) + Cards (mobile)
- [ ] **Loading:** Overlay com blur durante fetch
- [ ] **Empty States:** Mensagens apropriadas
- [ ] **URL:** Todos os estados na URL (page, limit, query, sortBy, sortOrder)
- [ ] **AJAX:** Navegação sem reload (`scroll: false`)
- [ ] **Acessibilidade:** ARIA labels, keyboard navigation
- [ ] **Performance:** SSR + skip first render + debounce

## 9. Exemplo de Implementação

**Referência completa:**
- `front/src/app/dashboard/products/page.tsx` (Server Component)
- `front/src/components/products/products-table.tsx` (Client Component)
- `front/src/actions/product-actions.ts` (Server Action)

## 10. Exceções e Variações

### 10.1 Quando NÃO aplicar este padrão

- Dashboards com widgets (não é listagem)
- Relatórios com visualizações customizadas
- Telas de detalhes (single entity)

### 10.2 Variações permitidas

- **Filtros adicionais:** Dropdowns, date pickers (além da busca)
- **Ações em massa:** Checkboxes + barra de ações
- **Colunas customizadas:** Adicionar/remover conforme entidade
- **Ordenação padrão:** Pode variar por entidade (ex: `name ASC` vs `created_at DESC`)

## 11. Manutenção e Evolução

### 11.1 Componentes Reutilizáveis

Criar abstrações quando houver 3+ telas usando o mesmo padrão:
- `<DataTable />` genérico
- `<PaginationControls />` standalone
- `<SortableHeader />` component

### 11.2 Atualizações desta Spec

Ao evoluir o padrão:
1. Atualizar esta spec
2. Criar migration guide
3. Atualizar telas existentes gradualmente
4. Marcar versão da spec

---

**Versão:** 1.0  
**Data:** 2026-01-29  
**Autor:** Pazini Development Team  
**Status:** ✅ Aprovado e em uso
