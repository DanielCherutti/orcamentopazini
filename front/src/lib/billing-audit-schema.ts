import { getDb } from "@/lib/surreal";
import { Table } from "surrealdb";

let ensured = false;

export async function ensureBillingAuditSchema(): Promise<void> {
    if (ensured) return;
    const db = await getDb();
    await db.query(`
        DEFINE TABLE IF NOT EXISTS platform_charge SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS platform_billing_settings SCHEMALESS;
        DEFINE TABLE IF NOT EXISTS audit_log SCHEMALESS;
        DEFINE INDEX IF NOT EXISTS idx_platform_charge_tenant ON platform_charge FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_platform_charge_status ON platform_charge FIELDS status;
        DEFINE INDEX IF NOT EXISTS idx_platform_charge_period ON platform_charge FIELDS billing_period;
        DEFINE INDEX IF NOT EXISTS idx_platform_charge_asaas ON platform_charge FIELDS asaas_payment_id;
        DEFINE INDEX IF NOT EXISTS idx_tenant_asaas_customer ON tenant FIELDS asaas_customer_id;
        DEFINE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log FIELDS created_at;
        DEFINE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log FIELDS actor_email;
        DEFINE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log FIELDS action;
        DEFINE INDEX IF NOT EXISTS idx_audit_log_resource ON audit_log FIELDS resource_type;
    `);
    ensured = true;
}

/** Copia registros legados de platform_audit_log para audit_log (idempotente por metadata.legacy_id). */
export async function migratePlatformAuditLogToAuditLog(): Promise<number> {
    await ensureBillingAuditSchema();
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM platform_audit_log ORDER BY created_at ASC",
    );
    let migrated = 0;
    for (const row of rows[0] ?? []) {
        const legacyId = String(row.id ?? "");
        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM audit_log WHERE metadata.legacy_id = $legacyId LIMIT 1",
            { legacyId },
        );
        if ((existing[0]?.length ?? 0) > 0) continue;

        const action = String(row.action ?? "platform.unknown");
        const tenantId = row.tenant_id != null ? String(row.tenant_id) : null;
        await db.create(new Table("audit_log")).content({
            scope: tenantId ? "tenant" : "platform",
            tenant_id: tenantId,
            actor_email: String(row.actor_email ?? "system"),
            actor_kind: "impersonation",
            action,
            resource_type: "impersonation",
            resource_id: legacyId,
            summary: `Impersonate: ${action}`,
            metadata: {
                legacy_id: legacyId,
                mode: row.mode ?? null,
                reason: row.reason ?? null,
                tenant_slug: row.tenant_slug ?? null,
            },
            created_at: String(row.created_at ?? new Date().toISOString()),
        });
        migrated++;
    }
    return migrated;
}
