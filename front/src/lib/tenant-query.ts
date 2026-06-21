import { getActiveTenantId } from "@/lib/tenant-context";
import { StringRecordId } from "surrealdb";

/** ID do tenant ativo na sessão (após assertActionSession). */
export async function requireActiveTenantId(): Promise<string> {
    const tenantId = await getActiveTenantId();
    if (!tenantId) {
        throw new Error("Tenant ausente na sessão");
    }
    return tenantId;
}

export function tenantRecordId(tenantId: string): StringRecordId {
    return new StringRecordId(tenantId);
}
