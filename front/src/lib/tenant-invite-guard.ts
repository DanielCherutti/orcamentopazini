import { StringRecordId } from "surrealdb";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { getTenantAccessBlockReason } from "@/lib/tenant-license";

export async function assertTenantOperationalForInvite(tenantId: string): Promise<string | null> {
    const db = await getDb();
    try {
        const rows = await db.query<[Array<{ active?: boolean; license_expires_at?: string | null }>]>(
            "SELECT active, license_expires_at FROM tenant WHERE id = $id LIMIT 1",
            { id: new StringRecordId(tenantId) },
        );
        const row = rows[0]?.[0];
        if (!row) return "Organização não encontrada";
        const block = getTenantAccessBlockReason({
            active: row.active !== false,
            license_expires_at: row.license_expires_at ?? null,
        });
        if (block === "inactive") return "Organização desativada — criação de usuários bloqueada";
        if (block === "expired") return "Licença expirada — criação de usuários bloqueada";
        return null;
    } catch (error) {
        console.error("assertTenantOperationalForInvite:", error);
        if (isTokenExpiredError(error)) resetDb();
        return "Erro ao verificar licença da organização";
    }
}
