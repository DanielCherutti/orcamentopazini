# ADR 003: URL como Fonte da Verdade para Estado de Listagens

**Status:** Aceito  
**Data:** 2026-01-29  
**Decisores:** Pazini Development Team  
**Contexto Técnico:** Gerenciamento de estado em listagens

## Contexto

Ao implementar filtros, paginação e ordenação em listagens, precisamos decidir onde armazenar o estado da interface:

**Opções:**
1. Estado local (useState)
2. Context API
3. URL query parameters
4. Local Storage
5. Cookies

## Decisão

Usar **URL query parameters** como fonte única da verdade para todo o estado de listagens (paginação, filtros, ordenação).

### Formato

```
/dashboard/products?page=2&limit=20&query=camera&sortBy=code&sortOrder=asc
```

### Implementação

```typescript
// Ler estado da URL
const searchParams = useSearchParams();
const page = Number(searchParams.get("page")) || 1;
const limit = Number(searchParams.get("limit")) || 10;
const query = searchParams.get("query") || "";
const sortBy = searchParams.get("sortBy") || "created_at";
const sortOrder = searchParams.get("sortOrder") || "desc";

// Atualizar estado via URL
const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`?${params.toString()}`, { scroll: false });
};
```

## Alternativas Consideradas

### 1. useState (estado local)
**Prós:**
- Simples
- Rápido

**Contras:**
- ❌ Perde estado ao recarregar
- ❌ Não pode compartilhar link
- ❌ Botão voltar não funciona
- ❌ Sem deep linking

### 2. Context API
**Prós:**
- Estado global
- Compartilhado entre componentes

**Contras:**
- ❌ Mesmos problemas do useState
- ❌ Mais complexo
- ❌ Não persiste

### 3. Local Storage
**Prós:**
- Persiste entre sessões

**Contras:**
- ❌ Não pode compartilhar
- ❌ Botão voltar não funciona
- ❌ Sincronização complexa

### 4. URL Query Params (escolhida)
**Prós:**
- ✅ Compartilhável (copiar link)
- ✅ Histórico do navegador funciona
- ✅ Deep linking funciona
- ✅ SEO-friendly
- ✅ Stateless (servidor pode renderizar)
- ✅ Debugging fácil (ver estado na URL)

**Contras:**
- ⚠️ Limitado a strings simples
- ⚠️ URL pode ficar longa

## Justificativa

1. **Compartilhamento:** Usuário pode copiar URL e enviar para colega
2. **Histórico:** Botão voltar/avançar funciona naturalmente
3. **Deep Linking:** Pode criar links diretos (ex: "produtos página 3 ordenados por preço")
4. **SSR:** Servidor pode renderizar estado correto na primeira carga
5. **Debugging:** Estado visível na URL facilita suporte
6. **Bookmarks:** Usuário pode salvar filtros favoritos

## Consequências

### Positivas
- ✅ Compartilhamento de links com filtros aplicados
- ✅ Botão voltar/avançar funciona perfeitamente
- ✅ Bookmarks funcionam
- ✅ Deep linking para qualquer estado
- ✅ SSR com estado correto
- ✅ Debugging simplificado
- ✅ Sem necessidade de gerenciar estado complexo

### Negativas
- ⚠️ URL pode ficar longa com muitos filtros
- ⚠️ Apenas tipos primitivos (strings, números, booleans)
- ⚠️ Precisa validar/sanitizar params

### Neutras
- 🔄 Padrão deve ser seguido em todas as listagens
- 🔄 Documentação clara necessária

## Detalhes de Implementação

### Leitura de Parâmetros

```typescript
const searchParams = useSearchParams();

// Com defaults
const page = Number(searchParams.get("page")) || 1;
const limit = Number(searchParams.get("limit")) || 10;

// Validação
const validLimit = [10, 20, 50, 100].includes(limit) ? limit : 10;
```

### Atualização de Parâmetros

```typescript
const updateParams = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    
    Object.entries(updates).forEach(([key, value]) => {
        if (value) {
            params.set(key, value);
        } else {
            params.delete(key); // Remove se vazio
        }
    });
    
    router.push(`?${params.toString()}`, { scroll: false });
};
```

### Reset de Filtros

```typescript
const clearFilters = () => {
    router.push(pathname, { scroll: false }); // Remove todos os params
};
```

### Preservação de Parâmetros

```typescript
// Ao mudar página, preservar filtros
const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    // query, sortBy, sortOrder são preservados automaticamente
    router.push(`?${params.toString()}`, { scroll: false });
};
```

## Padrões e Convenções

### Nomenclatura
- `page` - Número da página (1-indexed)
- `limit` - Itens por página
- `query` - Termo de busca
- `sortBy` - Campo de ordenação
- `sortOrder` - Direção (`asc` | `desc`)

### Valores Padrão
```typescript
const DEFAULTS = {
    page: 1,
    limit: 10,
    query: "",
    sortBy: "created_at",
    sortOrder: "desc"
};
```

### Validação
```typescript
// Sempre validar valores da URL
const page = Math.max(1, Number(searchParams.get("page")) || 1);
const limit = [10, 20, 50, 100].includes(Number(searchParams.get("limit"))) 
    ? Number(searchParams.get("limit")) 
    : 10;
```

## Casos de Uso

### 1. Compartilhar Filtro
```
Usuário: "Olha esses produtos de câmera ordenados por preço"
Link: /dashboard/products?query=camera&sortBy=equipmentPrice&sortOrder=asc
```

### 2. Bookmark de Relatório
```
Usuário salva: /dashboard/products?limit=100&sortBy=created_at&sortOrder=desc
Resultado: Sempre abre com 100 itens, mais recentes primeiro
```

### 3. Deep Link em Email
```
Email: "Veja os produtos pendentes de aprovação"
Link: /dashboard/products?status=pending&page=1
```

### 4. Debugging
```
Suporte: "Me manda a URL que você está vendo"
Desenvolvedor: Vê exatamente o mesmo estado
```

## Limitações e Mitigações

### Limitação 1: URL muito longa
**Mitigação:** 
- Usar abreviações (ex: `q` em vez de `query`)
- Comprimir valores complexos
- Considerar POST para filtros muito complexos

### Limitação 2: Tipos complexos
**Mitigação:**
- Serializar objetos como JSON
- Usar formato compacto (ex: `tags=1,2,3`)
- Para filtros muito complexos, considerar saved searches

### Limitação 3: Segurança
**Mitigação:**
- Sempre validar no servidor
- Sanitizar inputs
- Não confiar em valores da URL

## Referências

- [Next.js: useSearchParams](https://nextjs.org/docs/app/api-reference/functions/use-search-params)
- [Web API: URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams)
- Spec: `specs/02-listing-ui-pattern.spec.md`
- Implementação: `front/src/components/products/products-table.tsx`

## Histórico de Revisões

- 2026-01-29: Decisão inicial aceita
