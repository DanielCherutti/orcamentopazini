# Spec: Isolamento de Seleção no AddGroupDialog

**Data:** 2026-03-19
**Status:** Implementado (2026-03-19)

---

## 1. Contexto e Objetivo

- **Contexto:** O dialog "Adicionar Grupo de Produtos" (`AddGroupDialog`) exibe múltiplos grupos de produtos. Um mesmo produto pode pertencer a mais de um grupo simultaneamente. No estado atual, selecionar um produto em qualquer grupo reflete como selecionado em todos os outros grupos que o contêm — causando inserções duplicadas no orçamento.
- **Objetivo:** Garantir que a seleção de um produto seja isolada por grupo: selecionar "Produto A" no "Grupo 1" não deve marcar "Produto A" no "Grupo 2". Além disso, ao clicar em "Adicionar", cada produto selecionado deve ser inserido **apenas uma vez**, dentro do grupo em que foi selecionado.
- **Escopo:** Apenas o componente `AddGroupDialog` e o estado interno de seleção/quantidade. Nenhuma alteração no banco de dados ou nas Server Actions de inserção.

---

## 2. Requisitos Funcionais

| # | Comportamento | Entrada | Saída / Efeito |
|---|---|---|---|
| RF-01 | Seleção isolada por grupo | Usuário marca produto P no Grupo A | Apenas a linha de P no Grupo A fica marcada; P em outros grupos permanece **desmarcado** |
| RF-02 | Bloqueio em outros grupos | Produto P já selecionado no Grupo A | P aparece **desabilitado e opaco** em todos os outros grupos que o contêm |
| RF-03 | Desbloqueio ao desmarcar | Usuário desmarca P no Grupo A | P volta a estar disponível (habilitado) nos demais grupos |
| RF-04 | Quantidade independente | Usuário seta qty=5 para P no Grupo A | P no Grupo B não herda essa quantidade; mantém padrão 1 |
| RF-05 | "Selecionar disponíveis" | Usuário clica no botão de seleção de grupo | Apenas produtos **não bloqueados** por outros grupos são selecionados |
| RF-06 | Contador correto | N produtos selecionados (um por grupo ou mais de um no mesmo grupo) | Botão "Adicionar (N)" reflete o total exato de seleções únicas |
| RF-07 | Inserção única por seleção | Usuário confirma com P selecionado apenas no Grupo A | Sistema insere P **uma única vez** no escopo, associado ao Grupo A |

---

## 3. Contratos e Interfaces

### 3.1 Estado Interno do Componente

O estado de seleção deve usar **chave composta** para identificar cada par (grupo, produto) de forma única:

```
chave = `${identificador_único_do_grupo}::${productId}`
```

**Problema Crítico — IDs do SurrealDB 3.x:**

O SDK SurrealDB 3.x serializa IDs de registros como objetos `RecordId` (não como strings primitivas). Ao converter para string via `String(recordId)` ou interpolação `${recordId}`, o resultado **pode ser inconsistente** dependendo de como o UUID interno é representado:

| Cenário | Resultado de `String(recordId)` | Problema |
|---|---|---|
| RecordId com UUID armazenado como string | `"product_group:abc-123"` | ✓ Correto |
| RecordId com UUID armazenado como objeto `Uuid` | `"product_group:[object Object]"` | ✗ **Todos os grupos retornam a mesma string** |

**Consequência observada:** `selectedProductIds` com `ckey(group.id, p.id)` gera a **mesma chave** para grupos distintos, fazendo o `Set` ter tamanho 1 mas todos os grupos aparecerem como selecionados.

**Tratamento Correto — Identificador por Índice:**

A solução confiável é usar o **índice do grupo no array** como identificador interno, em vez do `group.id`:

```ts
// ✅ Correto — índice é sempre um número único por posição no array
const ckey = (groupIdx: number, productId: string) => `${groupIdx}::${productId}`;

// ❌ Incorreto — group.id pode serializar para "[object Object]" no SDK 3.x
const ckey = (groupId: string, productId: string) => `${groupId}::${productId}`;
```

O `group.id` continua sendo usado **exclusivamente** nas chamadas às Server Actions e ao banco de dados, onde é convertido corretamente por `StringRecordId`.

### 3.2 Estrutura de Estado

```ts
// Estado de seleção: chaves compostas "idx::productId"
const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

// Quantidades: mesma chave composta
const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

// Produtos por grupo: keyed por índice numérico (não por group.id)
const [groupProducts, setGroupProducts] = useState<Record<number, GroupProduct[]>>({});

// Grupos filtrados com índice original preservado
const filteredGroupsWithIdx = useMemo(() => {
  return groups
    .map((g, idx) => ({ group: g, idx }))
    .filter(({ group }) => group.name.toLowerCase().includes(query));
}, [groups, search]);
```

### 3.3 Por que `groupProducts` também deve usar índice

Se `group.id` para dois grupos distintos serializa para o mesmo string, então `productsMap[group.id]` **sobrescreve** os produtos do grupo anterior. Usando `productsMap[idx]`, cada grupo tem sua própria entrada garantida.

### 3.4 Regra de Tratamento de IDs SurrealDB (aplicável globalmente)

```ts
// Normalização obrigatória ao passar IDs para queries
import { StringRecordId } from "surrealdb";

// ✅ Para queries — sempre usar StringRecordId
const recordId = new StringRecordId(`tabela:${rawId}`);
await db.query(`SELECT * FROM $id`, { id: recordId });

// ✅ Para serializar ID recebido do banco (Server Action → Client)
function safeStringId(raw: unknown, table: string): string {
  if (typeof raw === "string") return raw;
  // RecordId object do SDK 3.x: extrair .tb e .id manualmente
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    // Acessar propriedades diretamente, evitar String() que pode dar [object Object]
    if (r.tb && r.id) {
      const idPart = typeof r.id === "object"
        ? JSON.stringify(r.id) // fallback
        : String(r.id);
      return `${r.tb}:${idPart}`;
    }
  }
  return `${table}:${String(raw)}`;
}

// ❌ Nunca usar como chave interna de Map/Record/Set
const key = String(group.id);      // pode ser "product_group:[object Object]"
const key = `${group.id}::${p.id}`; // mesma chave para todos os grupos
```

---

## 4. Fluxos e Estados

### Fluxo Feliz

1. Usuário abre o dialog "Adicionar Grupo de Produtos"
2. Estado é resetado (seleção vazia, quantidades vazias)
3. Grupos e produtos são carregados; cada grupo ocupa posição `idx` no array
4. Usuário seleciona produto P no Grupo 1 (idx=0): `selectedKeys` = `{"0::product:xyz"}`
5. Produto P no Grupo 2 (idx=1) aparece **desabilitado e opaco**
6. Usuário confirma: `handleAdd` itera por índice, filtra `selectedKeys.has("0::product:xyz")` → true para grupo 0, false para grupo 1
7. Produto é inserido apenas no Grupo 1; contador era "(1)", toast exibe "1 produto(s) adicionado(s)"

### Fluxo com Múltiplos Grupos e Produtos Distintos

1. Usuário seleciona produto A no Grupo 1 e produto B no Grupo 2 (B não existe no Grupo 1)
2. `selectedKeys` = `{"0::product:A", "1::product:B"}`, contador = "(2)"
3. Confirmar insere A no Grupo 1 e B no Grupo 2 → 2 itens adicionados

### Estados Alternativos

- **Nenhuma seleção:** Botão "Adicionar" desabilitado
- **Busca de grupo sem resultados:** Mensagem "Nenhum grupo encontrado com esse nome."
- **Falha na inserção:** Toast de erro, dialog permanece aberto

---

## 5. Dados

Nenhuma alteração de schema. A spec afeta apenas o estado de UI em memória.

Para referência, as tabelas envolvidas:
- `product_group` — grupos de produtos (cada grupo tem ID único)
- `product` — produtos (campo `group_ids: array<RecordId>` referencia grupos)
- `budget_item` — item inserido no orçamento (referencia `group_id` e `product_id`)

---

## 6. NFRs

- **Segurança:** Nenhum dado do usuário persiste no estado entre aberturas do dialog (reset em `useEffect([open])`)
- **Performance:** `selectedBareProductIds` deve ser `useMemo` derivado de `selectedKeys` — O(n) na abertura, O(1) por produto no render
- **Correção:** O produto selecionado deve ser inserido exatamente uma vez, no grupo onde foi selecionado, com a quantidade informada para aquele grupo

---

## 7. Guardrails

- Não adicionar dependências externas
- Manter o contrato da prop `addGroupToSection` inalterado (recebe `groupId: string` real do banco)
- Usar `idx` (índice numérico) apenas como chave de estado interno; nunca persistir `idx` no banco
- O `group.id` real do banco deve ser passado para `addGroupToSection` em `handleAdd`

---

## 8. Critérios de Aceite

- [x] Selecionar produto P no Grupo 1 → P no Grupo 2 aparece desabilitado (opacity-40), não selecionado
- [x] Desmarcar P no Grupo 1 → P no Grupo 2 volta a estar disponível (habilitado, não marcado)
- [x] Contador "Adicionar (N)" conta seleções únicas — com 1 produto selecionado em 1 grupo, mostra "(1)"
- [x] Confirmar com P em Grupo 1 → banco recebe UMA inserção de P associada ao Grupo 1; Grupo 2 não é afetado
- [x] Quantidade definida para P no Grupo 1 não é herdada por P no Grupo 2
- [x] "Selecionar disponíveis" seleciona apenas produtos não bloqueados por outros grupos
- [x] "Desmarcar todos" remove seleções do grupo atual sem afetar outros grupos
- [x] Busca por nome de grupo filtra sem perder o índice original (produto do Grupo 2 continua usando idx correto após filtro)

---

## 9. Testes

### Manual

1. Criar produto P pertencente a Grupo 1 e Grupo 2
2. Abrir dialog → verificar ambos aparecem desmarcados
3. Selecionar P no Grupo 1 → verificar P no Grupo 2 fica opaco/desabilitado
4. Desmarcar P no Grupo 1 → verificar P no Grupo 2 fica disponível novamente
5. Selecionar P no Grupo 1, clicar Adicionar → verificar apenas 1 linha criada no escopo do orçamento, associada ao Grupo 1
6. Definir qty=3 para P no Grupo 1, confirmar → linha inserida tem quantidade 3
7. Testar busca: buscar "Grupo 2", selecionar produto, confirmar → produto inserido corretamente no Grupo 2

---

## 10. Migração / Rollback

Sem migração de banco. Rollback = reverter `add-group-dialog.tsx` para versão anterior.

---

## 11. Investigação: Por Que as Alterações Não Refletem

Durante o desenvolvimento desta feature, observamos que o arquivo `add-group-dialog.tsx` foi modificado corretamente (verificado por MD5 e conteúdo), mas o navegador continuou exibindo o comportamento antigo mesmo após:
- Hard refresh (Ctrl+Shift+R)
- Aba anônima
- Reinicialização completa do computador

**Hipóteses a investigar:**

1. **Build de produção sobrepondo dev**: Um `bun run build` anterior gerou chunks em `.next/static/chunks/`. Se o servidor estiver rodando `bun run start` (produção) em vez de `bun run dev`, serve esses chunks compilados antes das mudanças.
   - **Verificar:** `ps aux | grep next` — se mostrar `next start` em vez de `next dev`
   - **Solução:** Deletar `.next/` e iniciar exclusivamente com `bun run dev`

2. **File watcher inativo no volume montado**: O Next.js usa `chokidar` para detectar mudanças. Volumes montados via SMB/NFS/APFS (como `/Volumes/Data/...`) podem não disparar eventos de mudança de arquivo.
   - **Verificar:** Se `/Volumes/Data/` é um volume de rede ou disco externo
   - **Solução:** Editar sempre a partir de `/Users/aguinelo/workspace/...` (mesmo arquivo via hardlink), OU configurar `CHOKIDAR_USEPOLLING=true` no `dev.sh`

3. **Next.js lazy compilation com cache stale**: Em dev mode, componentes são compilados sob demanda e cacheados em `.next/cache/webpack/`. Se o cache contém uma versão compilada e o file watcher não detecta a mudança, o cache não é invalidado.
   - **Solução:** Deletar `.next/cache/` antes de iniciar o dev server

**Diagnóstico rápido:**
```bash
# Verifica qual servidor está rodando
ps aux | grep -E "next (dev|start|server)"

# Força uso de polling para file watching em volumes montados
CHOKIDAR_USEPOLLING=true bun run dev

# Limpa tudo e reinicia
rm -rf .next && bun run dev
```

---

## Checklist Rápido

- [x] Requisitos funcionais claros e testáveis?
- [x] Interfaces (UI e Dados) definidas?
- [x] Fluxos de erro cobertos?
- [x] Guardrails de segurança e performance verificados?
- [x] Critérios de aceite cobrem happy path e edge cases?
- [x] Problema de IDs SurrealDB documentado com causa raiz e solução?
