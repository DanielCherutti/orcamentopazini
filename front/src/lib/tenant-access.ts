import type { Surreal } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import {
    InvalidRecordIdError,
    recordIdToString,
    requireRecordId,
} from "@/lib/surreal-record-ids";

export function rowBelongsToActiveTenant(
    rowTenantId: unknown,
    activeTenantId: string,
): boolean {
    const rowTenant = recordIdToString(rowTenantId);
    if (!rowTenant) return true;
    return rowTenant === activeTenantId;
}

export type EntityTenantGate =
    | { ok: true; tenantId: string }
    | { ok: false; error: string };

/** Valida que um registro pertence ao tenant informado (API routes / scripts). */
export async function assertEntityBelongsToTenant(
    table: string,
    id: string,
    tenantId: string,
    notFoundMessage = "Não encontrado",
    db?: Surreal,
): Promise<EntityTenantGate> {
    try {
        const database = db ?? (await getDb());
        const recordId = requireRecordId(table, id);
        const res = await database.query<[Array<{ tenant_id?: unknown }>]>(
            `SELECT tenant_id FROM ${table} WHERE id = $id LIMIT 1`,
            { id: recordId },
        );
        const row = res[0]?.[0];
        if (!row) {
            return { ok: false, error: notFoundMessage };
        }
        if (!rowBelongsToActiveTenant(row.tenant_id, tenantId)) {
            return { ok: false, error: notFoundMessage };
        }
        return { ok: true, tenantId };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: notFoundMessage };
    }
}

/** Valida que um registro de catálogo pertence ao tenant ativo. */
export async function assertEntityInActiveTenant(
    table: string,
    id: string,
    notFoundMessage = "Não encontrado",
    db?: Surreal,
): Promise<EntityTenantGate> {
    try {
        const tenantId = await requireActiveTenantId();
        return assertEntityBelongsToTenant(table, id, tenantId, notFoundMessage, db);
    } catch {
        return { ok: false, error: notFoundMessage };
    }
}

/** Valida client_id pertence ao tenant antes de vincular em orçamento. */
export async function assertClientInActiveTenant(
    clientId: string,
    db?: Surreal,
): Promise<EntityTenantGate> {
    return assertEntityInActiveTenant("client", clientId, "Cliente não encontrado", db);
}
