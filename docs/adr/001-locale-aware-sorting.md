# ADR 001: Ordenação Locale-Aware no JavaScript em vez de SQL

**Status:** Aceito  
**Data:** 2026-01-29  
**Decisores:** Pazini Development Team  
**Contexto Técnico:** Listagem de produtos com ordenação

## Contexto

Ao implementar ordenação por colunas na listagem de produtos, descobrimos que o SurrealDB (como a maioria dos bancos de dados) realiza ordenação binária (byte-a-byte), onde caracteres acentuados têm valores ASCII maiores que letras sem acento. Isso resultava em ordenação incorreta para o português brasileiro:

**Problema:**
- "Âncora" aparecia **depois** de "Tubo" (incorreto)
- Esperado: "Âncora" antes de "Tubo" (ordem alfabética pt-BR)

## Decisão

Implementar ordenação **locale-aware no JavaScript** usando `Intl.Collator` em vez de confiar na ordenação SQL do banco de dados.

### Implementação

```typescript
// Buscar TODOS os registros filtrados (sem LIMIT)
const allProducts = await db.query(sql, queryParams);

// Ordenar com locale pt-BR
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });
allProducts.sort((a, b) => {
    if (typeof aValue === 'string' && typeof bValue === 'string') {
        const comparison = collator.compare(aValue, bValue);
        return sortOrder === 'asc' ? comparison : -comparison;
    }
    // ... números
});

// Aplicar paginação DEPOIS da ordenação
const products = allProducts.slice(start, start + limit);
```

## Alternativas Consideradas

### 1. Usar COLLATE no SQL
**Prós:**
- Ordenação no banco (mais eficiente para grandes datasets)
- Menos dados trafegados

**Contras:**
- SurrealDB não suporta COLLATE nativamente
- Precisaria de extensões ou configurações complexas
- Menos portável

### 2. Campo normalizado sem acentos
**Prós:**
- Ordenação rápida no banco
- Funciona em qualquer DB

**Contras:**
- Duplicação de dados
- Manutenção adicional
- Não resolve completamente (ç, ñ, etc.)

### 3. Ordenação no JavaScript (escolhida)
**Prós:**
- ✅ Funciona perfeitamente com acentuação
- ✅ Suporte nativo do JavaScript (`Intl.Collator`)
- ✅ Portável (funciona com qualquer banco)
- ✅ Fácil de testar e manter
- ✅ Sem mudanças no schema

**Contras:**
- ⚠️ Performance degradada para datasets muito grandes (>10.000 registros)
- ⚠️ Mais memória usada no servidor

## Justificativa

1. **Dataset atual:** ~50-500 produtos esperados → Performance aceitável
2. **Corretude:** Ordenação correta é mais importante que performance marginal
3. **Simplicidade:** Solução mais simples e manutenível
4. **Portabilidade:** Funciona com qualquer banco de dados

## Consequências

### Positivas
- ✅ Ordenação alfabética correta para português
- ✅ Código mais simples e legível
- ✅ Fácil de estender para outros locales
- ✅ Sem mudanças no schema do banco

### Negativas
- ⚠️ Todos os registros filtrados são carregados em memória
- ⚠️ Pode ser lento para datasets muito grandes

### Neutras
- 🔄 Se o dataset crescer muito (>10.000), podemos migrar para:
  - Campo normalizado para ordenação
  - Índices com collation (se SurrealDB adicionar suporte)
  - Elasticsearch/Algolia para busca avançada

## Notas de Implementação

### Quando aplicar
- Todas as listagens com ordenação de strings
- Especialmente campos com nomes próprios, descrições, endereços

### Quando NÃO aplicar
- Datasets com >10.000 registros (considerar alternativas)
- Ordenação apenas numérica (usar SQL diretamente)
- Campos sem acentuação (ex: códigos alfanuméricos)

### Monitoramento
- Acompanhar tempo de resposta das listagens
- Se ultrapassar 1 segundo, considerar otimizações

## Referências

- [MDN: Intl.Collator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator)
- [Spec: 02-listing-ui-pattern.spec.md](../specs/02-listing-ui-pattern.spec.md)
- Implementação: `front/src/actions/product-actions.ts`

## Histórico de Revisões

- 2026-01-29: Decisão inicial aceita
