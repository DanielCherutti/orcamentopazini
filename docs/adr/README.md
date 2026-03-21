# Architecture Decision Records (ADRs)

Este diretório contém os registros de decisões arquiteturais (ADRs) do projeto Pazini.

## O que é um ADR?

Um ADR documenta uma decisão arquitetural significativa, incluindo:
- **Contexto:** Por que a decisão foi necessária
- **Decisão:** O que foi decidido
- **Alternativas:** Outras opções consideradas
- **Consequências:** Impactos da decisão

## Índice de ADRs

### ADR 001: [Ordenação Locale-Aware no JavaScript](./001-locale-aware-sorting.md)
**Status:** ✅ Aceito  
**Data:** 2026-01-29  
**Resumo:** Usar `Intl.Collator` no JavaScript para ordenação com suporte a acentuação (pt-BR) em vez de confiar na ordenação SQL binária do banco de dados.

**Decisão-chave:** Buscar todos os registros filtrados, ordenar no JavaScript com locale pt-BR, e paginar depois.

**Impacto:** Ordenação correta de "Âncora" antes de "Tubo", mas pode ser lento para datasets >10.000 registros.

---

### ADR 002: [Navegação Client-Side com AJAX em Listagens](./002-hybrid-navigation-listings.md)
**Status:** ✅ Aceito  
**Data:** 2026-01-29  
**Resumo:** Implementar navegação híbrida combinando SSR (primeira carga) com AJAX (navegação subsequente) para melhor UX sem perder SEO.

**Decisão-chave:** Server Component para SSR inicial + Client Component com `useEffect` para navegação AJAX.

**Impacto:** Experiência SPA-like sem reload, mantendo benefícios de SSR para SEO e performance inicial.

---

### ADR 003: [URL como Fonte da Verdade para Estado de Listagens](./003-url-as-source-of-truth.md)
**Status:** ✅ Aceito  
**Data:** 2026-01-29  
**Resumo:** Usar URL query parameters como fonte única da verdade para todo o estado de listagens (paginação, filtros, ordenação).

**Decisão-chave:** Todos os estados (page, limit, query, sortBy, sortOrder) na URL via `searchParams`.

**Impacto:** Links compartilháveis, histórico do navegador funciona, deep linking, debugging facilitado.

---

## Como Criar um Novo ADR

### 1. Quando criar um ADR?

Crie um ADR quando tomar uma decisão que:
- Afeta a arquitetura do sistema
- Tem impacto significativo em performance, segurança ou UX
- Tem alternativas viáveis (trade-offs)
- Será difícil de reverter
- Precisa ser comunicada para a equipe

### 2. Template

```markdown
# ADR XXX: [Título da Decisão]

**Status:** [Proposto | Aceito | Rejeitado | Supersedido | Depreciado]  
**Data:** YYYY-MM-DD  
**Decisores:** [Nome(s)]  
**Contexto Técnico:** [Área afetada]

## Contexto
[Descreva o problema ou necessidade]

## Decisão
[Descreva a decisão tomada]

## Alternativas Consideradas
### 1. [Alternativa 1]
**Prós:**
**Contras:**

### 2. [Alternativa escolhida]
**Prós:**
**Contras:**

## Justificativa
[Por que esta decisão foi tomada]

## Consequências
### Positivas
### Negativas
### Neutras

## Referências
[Links, specs, implementações]

## Histórico de Revisões
- YYYY-MM-DD: [Mudança]
```

### 3. Numeração

- Use números sequenciais: `001`, `002`, `003`, etc.
- Não reutilize números de ADRs rejeitados
- Mantenha ordem cronológica

### 4. Status

- **Proposto:** Em discussão
- **Aceito:** Aprovado e em uso
- **Rejeitado:** Não será implementado
- **Supersedido:** Substituído por outro ADR
- **Depreciado:** Ainda em uso mas será removido

## Processo de Revisão

1. **Criar ADR** em `docs/adr/XXX-titulo.md`
2. **Status: Proposto**
3. **Discussão** com equipe
4. **Aprovação** → Status: Aceito
5. **Implementação**
6. **Atualizar índice** (este arquivo)

## Manutenção

- ADRs são **imutáveis** após aceitos
- Para mudanças, criar novo ADR que supersede o anterior
- Manter histórico de revisões no final de cada ADR

## Referências

- [ADR GitHub Organization](https://adr.github.io/)
- [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- [ADR Tools](https://github.com/npryce/adr-tools)

---

**Última atualização:** 2026-01-29  
**Total de ADRs:** 3
