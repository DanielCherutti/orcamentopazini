/**
 * Regressão de isolamento multi-tenant (PAZINI-100) contra SurrealDB.
 *
 * Uso (em `front/`):
 *   npm run test:tenant-isolation
 *
 * Requer DB acessível (.env) e migração multi-tenant aplicada.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const TABLES_WITH_TENANT = [
    "product",
    "product_group",
    "product_unit",
    "client",
    "budget",
    "image_library",
] as const;

const WRONG_TENANT = "tenant:__regression_wrong__";

function assert(condition: boolean, message: string): void {
    if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
    const { StringRecordId } = await import("surrealdb");
    const { getDb } = await import("../src/lib/surreal");
    const { DEFAULT_TENANT_RECORD_ID } = await import("../src/lib/tenant-constants");
    const { recordIdToString } = await import("../src/lib/surreal-record-ids");
    const { assertBudgetBelongsToTenant } = await import("../src/lib/budget-tenant");
    const { assertEntityBelongsToTenant } = await import("../src/lib/tenant-access");
    const { tenantRecordId } = await import("../src/lib/tenant-query");

    const ns = process.env.SURREAL_NS || process.env.SURREALDB_NS || "?";
    const dbName = process.env.SURREAL_DB || process.env.SURREALDB_DB || "?";
    console.log(`tenant-isolation-regression: NS=${ns} DB=${dbName}`);

    async function countOrphans(table: string): Promise<number> {
        const db = await getDb();
        const res = await db.query<[Array<{ count: number }>]>(
            `SELECT count() AS count FROM ${table} WHERE tenant_id IS NONE GROUP ALL`,
        );
        return Number(res[0]?.[0]?.count ?? 0);
    }

    const db = await getDb();
    let passed = 0;

    console.log("tenant-isolation-regression: iniciando…");

    for (const table of TABLES_WITH_TENANT) {
        const orphans = await countOrphans(table);
        assert(orphans === 0, `${table}: ${orphans} registro(s) sem tenant_id`);
        console.log(`  ✓ ${table}: sem órfãos de tenant_id`);
        passed++;
    }

    const budgetRows = await db.query<[Array<{ id: unknown; tenant_id: unknown }>]>(
        "SELECT id, tenant_id FROM budget WHERE tenant_id = $tenantId LIMIT 1",
        { tenantId: tenantRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    const budgetRow = budgetRows[0]?.[0];
    assert(!!budgetRow, "Nenhum orçamento no tenant padrão para testar");
    const budgetId = recordIdToString(budgetRow!.id)!;
    const budgetTenant = recordIdToString(budgetRow!.tenant_id)!;

    const okBudget = await assertBudgetBelongsToTenant(budgetId, budgetTenant, db);
    assert(okBudget.ok, "assertBudgetBelongsToTenant deveria aceitar tenant correto");
    const badBudget = await assertBudgetBelongsToTenant(budgetId, WRONG_TENANT, db);
    assert(!badBudget.ok, "assertBudgetBelongsToTenant deveria rejeitar tenant errado");
    console.log("  ✓ budget: gate por tenant_id");

    const crossBudget = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM budget WHERE id = $id AND tenant_id = $tenantId LIMIT 1",
        {
            id: new StringRecordId(budgetId),
            tenantId: tenantRecordId(WRONG_TENANT),
        },
    );
    assert((crossBudget[0]?.length ?? 0) === 0, "Query cross-tenant deveria retornar vazio");
    console.log("  ✓ budget: query SQL cross-tenant vazia");
    passed += 2;

    const productRows = await db.query<[Array<{ id: unknown; tenant_id: unknown }>]>(
        "SELECT id, tenant_id FROM product WHERE tenant_id = $tenantId LIMIT 1",
        { tenantId: tenantRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    const productRow = productRows[0]?.[0];
    if (productRow) {
        const productId = recordIdToString(productRow.id)!;
        const productTenant = recordIdToString(productRow.tenant_id)!;
        const okProduct = await assertEntityBelongsToTenant(
            "product",
            productId,
            productTenant,
            "Produto não encontrado",
            db,
        );
        assert(okProduct.ok, "assertEntityBelongsToTenant deveria aceitar tenant correto");
        const badProduct = await assertEntityBelongsToTenant(
            "product",
            productId,
            WRONG_TENANT,
            "Produto não encontrado",
            db,
        );
        assert(!badProduct.ok, "assertEntityBelongsToTenant deveria rejeitar tenant errado");
        console.log("  ✓ product: gate por tenant_id");
        passed += 1;
    } else {
        console.log("  ~ product: nenhum registro no tenant padrão (pulando gate)");
    }

    const clientRows = await db.query<[Array<{ id: unknown; tenant_id: unknown }>]>(
        "SELECT id, tenant_id FROM client WHERE tenant_id = $tenantId LIMIT 1",
        { tenantId: tenantRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    const clientRow = clientRows[0]?.[0];
    if (clientRow) {
        const clientId = recordIdToString(clientRow.id)!;
        const clientTenant = recordIdToString(clientRow.tenant_id)!;
        const badClient = await assertEntityBelongsToTenant(
            "client",
            clientId,
            WRONG_TENANT,
            "Cliente não encontrado",
            db,
        );
        assert(!badClient.ok, "client gate deveria rejeitar tenant errado");
        const okClient = await assertEntityBelongsToTenant(
            "client",
            clientId,
            clientTenant,
            "Cliente não encontrado",
            db,
        );
        assert(okClient.ok, "client gate deveria aceitar tenant correto");
        console.log("  ✓ client: gate por tenant_id");
        passed += 1;
    } else {
        console.log("  ~ client: nenhum registro no tenant padrão (pulando gate)");
    }

    console.log(`tenant-isolation-regression: OK (${passed} checks)`);

    const { resetDb } = await import("../src/lib/surreal");
    resetDb();
    process.exit(0);
}

main().catch((err) => {
    console.error("tenant-isolation-regression: FALHOU");
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
