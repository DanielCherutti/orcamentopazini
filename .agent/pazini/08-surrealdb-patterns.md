# Padrões SurrealDB

## IDs de Registros — Regra Crítica

### Problema
Passar um ID como string pura em `WHERE id = $id` **não funciona** no SurrealDB. O campo `id` é do tipo `RecordId` internamente; comparar com string retorna 0 resultados silenciosamente, causando erros como "Registro não encontrado".

```ts
// ❌ ERRADO — nunca faz isso
await db.query(`UPDATE product_group SET name = $name WHERE id = $id`, { id: "product_group:abc123" });

// ❌ ERRADO — mesmo problema
await db.query(`SELECT * FROM product_group WHERE id = $id`, { id: "product_group:abc123" });
```

### Regra
**SEMPRE** usar `new StringRecordId(...)` ao passar um ID como parâmetro em queries. Para UPDATE/DELETE direto por ID, preferir `UPDATE $record SET ...` ao invés de `WHERE id = $id`.

```ts
import { StringRecordId } from "surrealdb.js";

// ✅ CORRETO — UPDATE direto pelo record
await db.query(
  `UPDATE $record SET name = $name, updated_at = $updated_at`,
  { record: new StringRecordId("product_group:abc123"), name: "Novo Nome", updated_at: new Date().toISOString() }
);

// ✅ CORRETO — SELECT com db.select
await db.select<T>(new StringRecordId("product_group:abc123"));

// ✅ CORRETO — se precisar de WHERE id, passar como StringRecordId
await db.query(`SELECT * FROM product_group WHERE id = $id`, {
  id: new StringRecordId("product_group:abc123"),
});
```

### Normalização de ID

IDs podem chegar em dois formatos dependendo da origem (URL, formulário, banco):
- Só o token: `"abc123"`
- Com prefixo da tabela: `"product_group:abc123"`

**SEMPRE** normalizar antes de usar:

```ts
function toRecordId(table: string, id: string): StringRecordId {
  const decoded = decodeURIComponent(id);
  const full = decoded.startsWith(`${table}:`) ? decoded : `${table}:${decoded}`;
  return new StringRecordId(full);
}
```

### Serialização de IDs na saída

O SurrealDB retorna `id` como objeto `RecordId`. **SEMPRE** serializar com `String(id)` ou extração manual antes de expor ao cliente:

```ts
// serializeGroup / serializeProduct etc.
function safeId(id: unknown): string {
  if (typeof id === "string") return id;
  const obj = id as Record<string, unknown>;
  if (obj?.tb && obj?.id) return `${obj.tb}:${obj.id}`;
  return String(id);
}
```

## db.create() — nunca desestruturar como array

`db.create(table, data)` retorna um **objeto único**, não um array. Desestruturar com `const [x] =` lança `TypeError: (intermediate value) is not iterable`.

```ts
// ❌ ERRADO
const [created] = await db.create("budget_location", { ... });

// ✅ CORRETO
const raw = await db.create("budget_location", { ... });
const created = Array.isArray(raw) ? raw[0] : raw;
```

> Mesma regra vale para qualquer retorno de `db.create()` em todo o projeto.

## Queries

- Preferir `db.select<T>(new StringRecordId(...))` para busca por ID único.
- Usar `db.query<[T[]]>(sql, params)` para queries com filtros/joins.
- Não interpolar valores diretamente na string SQL — sempre usar parâmetros nomeados (`$param`).
- Sempre extrair `result[0] ?? []` do retorno de `db.query` (retorna array de resultsets).

## Tratamento de Erros

- Capturar `isTokenExpiredError(error)` e chamar `resetDb()` em todo catch de query.
- Erros de "not found" devem retornar `{ success: false, error: "..." }`, nunca lançar exceção para o cliente.
