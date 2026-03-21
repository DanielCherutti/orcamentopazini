# ADR 002: Navegação Client-Side com AJAX em Listagens

**Status:** Aceito  
**Data:** 2026-01-29  
**Decisores:** Pazini Development Team  
**Contexto Técnico:** Paginação e filtros em telas de listagem

## Contexto

Telas de listagem tradicionais em Next.js usam Server Components com navegação via links, causando reload completo da página a cada interação (mudança de página, filtro, ordenação). Isso resulta em:

- ❌ Flash branco entre navegações
- ❌ Perda de scroll position
- ❌ Experiência de usuário inferior
- ❌ Recarregamento desnecessário de assets

## Decisão

Implementar **navegação híbrida** combinando SSR (primeira carga) com AJAX (navegação subsequente):

### Arquitetura

```
Page (Server Component)
  ↓ SSR inicial
  ↓ Passa dados iniciais
  ↓
DataTable (Client Component)
  ↓ Gerencia estado
  ↓ Detecta mudanças na URL
  ↓ Faz fetch AJAX
  ↓ Atualiza UI sem reload
```

### Implementação

```typescript
// Server Component (page.tsx)
export default async function ProductsPage({ searchParams }) {
    const result = await getProductsAction(params);
    return <ProductsTable initialProducts={result.data} initialMeta={result.meta} />;
}

// Client Component (products-table.tsx)
export function ProductsTable({ initialProducts, initialMeta }) {
    const [products, setProducts] = useState(initialProducts);
    const isFirstRender = useRef(true);
    
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return; // Skip SSR data
        }
        
        // AJAX fetch on URL change
        const fetchProducts = async () => {
            const result = await getProductsAction(params);
            setProducts(result.data);
        };
        fetchProducts();
    }, [page, limit, query, sortBy, sortOrder]);
    
    const handlePageChange = (newPage) => {
        router.push(`?page=${newPage}`, { scroll: false });
    };
}
```

## Alternativas Consideradas

### 1. Server Components puros (tradicional)
**Prós:**
- Simples de implementar
- SEO garantido
- Sem JavaScript necessário

**Contras:**
- ❌ Reload completo da página
- ❌ Flash branco
- ❌ UX inferior
- ❌ Perda de estado

### 2. Client Components puros (SPA)
**Prós:**
- Navegação suave
- Sem reload

**Contras:**
- ❌ Sem SSR (ruim para SEO)
- ❌ Loading inicial mais lento
- ❌ Mais JavaScript no bundle

### 3. Híbrido SSR + AJAX (escolhida)
**Prós:**
- ✅ SSR para primeira carga (SEO + performance)
- ✅ AJAX para navegação (UX)
- ✅ URL como fonte da verdade
- ✅ Botão voltar funciona
- ✅ Compartilhamento de links funciona

**Contras:**
- ⚠️ Mais complexo que alternativas
- ⚠️ Precisa gerenciar estado client + server

## Justificativa

1. **SEO:** SSR garante indexação correta
2. **Performance:** Primeira carga rápida com SSR
3. **UX:** Navegação suave sem reload
4. **Funcionalidade:** URL atualiza, histórico funciona
5. **Best of Both Worlds:** Combina vantagens de SSR e SPA

## Consequências

### Positivas
- ✅ Experiência de usuário superior (SPA-like)
- ✅ SEO mantido (SSR)
- ✅ Performance inicial ótima
- ✅ URL sempre atualizada
- ✅ Histórico do navegador funciona
- ✅ Compartilhamento de links funciona

### Negativas
- ⚠️ Código mais complexo (Server + Client)
- ⚠️ Precisa gerenciar sincronização de estado
- ⚠️ Risco de fetch duplicado (mitigado com `useRef`)

### Neutras
- 🔄 Padrão deve ser replicado em todas as listagens
- 🔄 Requer disciplina para evitar bugs de sincronização

## Detalhes de Implementação

### Evitar Fetch Duplicado

```typescript
const isFirstRender = useRef(true);

useEffect(() => {
    if (isFirstRender.current) {
        isFirstRender.current = false;
        return; // Usa dados do SSR
    }
    fetchData(); // AJAX apenas em mudanças subsequentes
}, [deps]);
```

### Loading States

```typescript
{(isLoading || isPending) && (
    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm">
        <Spinner />
    </div>
)}
```

### Navegação sem Scroll Jump

```typescript
router.push(`?${params}`, { scroll: false });
```

### Transições Suaves

```typescript
const [isPending, startTransition] = useTransition();

startTransition(() => {
    router.push(url);
});
```

## Padrão Obrigatório

Este padrão é **obrigatório** para todas as telas de listagem, conforme definido em:
- `specs/02-listing-ui-pattern.spec.md`

## Monitoramento

### Métricas a acompanhar
- Tempo de resposta AJAX (<500ms ideal)
- Taxa de erro em fetches
- Uso de memória no cliente

### Alertas
- Se tempo de resposta > 1s → investigar
- Se taxa de erro > 5% → investigar

## Referências

- [Next.js: Server and Client Components](https://nextjs.org/docs/app/building-your-application/rendering/composition-patterns)
- [React: useTransition](https://react.dev/reference/react/useTransition)
- Spec: `specs/02-listing-ui-pattern.spec.md`
- Implementação: `front/src/components/products/products-table.tsx`

## Histórico de Revisões

- 2026-01-29: Decisão inicial aceita
