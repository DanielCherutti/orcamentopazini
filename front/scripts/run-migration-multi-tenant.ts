/**
 * PAZINI-100 — Migração multi-tenant: tenant padrão, backfill tenant_id, memberships.
 *
 * Execução (em `front/`):
 *   bun scripts/migrate.ts scripts/run-migration-multi-tenant.ts
 *
 * Simular:
 *   MIGRATE_DRY_RUN=1 bun scripts/migrate.ts scripts/run-migration-multi-tenant.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Surreal, StringRecordId, Table } from "surrealdb";
import { requireSurrealPassword } from "../src/lib/surreal-env";
import { DEFAULT_TENANT_RECORD_ID } from "../src/lib/tenant-constants";
import { recordIdToString } from "../src/lib/surreal-record-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const host = process.env.SURREALDB_HOST || "127.0.0.1";
const port = process.env.SURREALDB_PORT || "8000";
const endpoint = process.env.SURREAL_URL || `http://${host}:${port}`;
const namespace = process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database = process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username = process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";

const DRY = String(process.env.MIGRATE_DRY_RUN || "").trim() === "1";
const LEGACY_ROLE = (process.env.PAZINI_MIGRATE_DEFAULT_ROLE || "admin").trim() as
    | "admin"
    | "user"
    | "master";

const TABLES_WITH_TENANT = [
    "product",
    "product_group",
    "product_unit",
    "client",
    "budget",
    "image_library",
] as const;

async function connectDb(): Promise<Surreal> {
    const db = new Surreal();
    await db.connect(endpoint);
    await db.signin({ username, password: requireSurrealPassword() });
    await db.use({ namespace, database });
    return db;
}

async function ensureSchema(db: Surreal): Promise<void> {
    await db.query(`
        DEFINE TABLE IF NOT EXISTS tenant SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS portal_user_tenant SCHEMALESS;
        DEFINE INDEX IF NOT EXISTS idx_tenant_slug ON tenant FIELDS slug UNIQUE;
        DEFINE INDEX IF NOT EXISTS idx_portal_user_tenant_user ON portal_user_tenant FIELDS user_id;
        DEFINE INDEX IF NOT EXISTS idx_portal_user_tenant_tenant ON portal_user_tenant FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_product_tenant ON product FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_client_tenant ON client FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_budget_tenant ON budget FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_image_library_tenant ON image_library FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_proposal_settings_tenant ON proposal_settings FIELDS tenant_id;
    `);
}

async function ensureDefaultTenant(db: Surreal): Promise<void> {
    const existing = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM tenant WHERE id = $id LIMIT 1",
        { id: new StringRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    if ((existing[0]?.length ?? 0) > 0) {
        console.log("Tenant padrão já existe:", DEFAULT_TENANT_RECORD_ID);
        return;
    }
    if (DRY) {
        console.log("[dry-run] Criaria tenant:pazini");
        return;
    }
    await db.query(
        `CREATE tenant:pazini CONTENT {
            name: 'Pazini',
            slug: 'pazini',
            active: true,
            created_at: time::now(),
            updated_at: time::now()
        }`,
    );
    console.log("Tenant padrão criado:", DEFAULT_TENANT_RECORD_ID);
}

async function backfillTenantId(db: Surreal, table: string): Promise<number> {
    const rows = await db.query<[Array<{ id: unknown }>]>(
        `SELECT id FROM ${table} WHERE tenant_id IS NONE`,
    );
    const items = rows[0] ?? [];
    if (items.length === 0) {
        console.log(`  ${table}: nada a backfill`);
        return 0;
    }
    if (DRY) {
        console.log(`  [dry-run] ${table}: ${items.length} registro(s) receberiam tenant_id`);
        return items.length;
    }
    await db.query(
        `UPDATE ${table} SET tenant_id = $tenantId, updated_at = time::now() WHERE tenant_id IS NONE`,
        { tenantId: new StringRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    console.log(`  ${table}: ${items.length} registro(s) atualizados`);
    return items.length;
}

async function backfillProposalSettings(db: Surreal): Promise<void> {
    const rows = await db.query<[Array<{ id: unknown; tenant_id?: unknown }>]>(
        "SELECT id, tenant_id FROM proposal_settings",
    );
    const all = rows[0] ?? [];
    const without = all.filter((r) => !recordIdToString(r.tenant_id));
    if (without.length === 0) {
        console.log("  proposal_settings: nada a backfill");
        return;
    }
    if (DRY) {
        console.log(`  [dry-run] proposal_settings: ${without.length} registro(s)`);
        return;
    }
    if (without.length === 1) {
        await db.query(
            "UPDATE $id SET tenant_id = $tenantId WHERE tenant_id IS NONE",
            {
                id: without[0]!.id,
                tenantId: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
            },
        );
        console.log("  proposal_settings: 1 registro vinculado ao tenant padrão");
        return;
    }
    console.warn(
        `  proposal_settings: ${without.length} registros sem tenant — vinculando todos ao padrão`,
    );
    await db.query(
        "UPDATE proposal_settings SET tenant_id = $tenantId WHERE tenant_id IS NONE",
        { tenantId: new StringRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
}

async function backfillMemberships(db: Surreal): Promise<number> {
    const users = await db.query<[Array<{ id: unknown; email?: string; active?: boolean }>]>(
        "SELECT id, email, active FROM portal_user",
    );
    let created = 0;
    for (const user of users[0] ?? []) {
        const userId = recordIdToString(user.id);
        if (!userId) continue;
        if (user.active === false) continue;

        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
            {
                userId: new StringRecordId(userId),
                tenantId: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
            },
        );
        if ((existing[0]?.length ?? 0) > 0) continue;

        if (DRY) {
            console.log(`  [dry-run] membership ${user.email} → ${LEGACY_ROLE}`);
            created++;
            continue;
        }

        await db.create(new Table("portal_user_tenant")).content({
            user_id: new StringRecordId(userId),
            tenant_id: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
            role: LEGACY_ROLE,
            created_at: new Date().toISOString(),
        });
        console.log(`  membership: ${user.email} → ${LEGACY_ROLE}`);
        created++;
    }
    return created;
}

export async function run(): Promise<void> {
    console.log(DRY ? "MIGRATE_DRY_RUN=1 (simulação)" : "Aplicando migração multi-tenant…");
    const db = await connectDb();
    try {
        await ensureSchema(db);
        await ensureDefaultTenant(db);

        console.log("Backfill tenant_id:");
        let total = 0;
        for (const table of TABLES_WITH_TENANT) {
            total += await backfillTenantId(db, table);
        }
        await backfillProposalSettings(db);

        console.log("Memberships portal_user_tenant:");
        const memberships = await backfillMemberships(db);

        console.log("\nResumo:");
        console.log(`  Registros backfill (aprox.): ${total}`);
        console.log(`  Memberships criadas: ${memberships}`);
        console.log(`  Tenant padrão: ${DEFAULT_TENANT_RECORD_ID}`);
    } finally {
        await db.close();
    }
}
