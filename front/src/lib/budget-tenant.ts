import type { Surreal } from "surrealdb";
import { StringRecordId } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import {
    InvalidRecordIdError,
    recordIdToString,
    requireRecordId,
} from "@/lib/surreal-record-ids";

export const BUDGET_NOT_FOUND = "Orçamento não encontrado";

export type BudgetTenantGate =
    | { ok: true; budgetId: string; budgetRecordId: StringRecordId }
    | { ok: false; error: string };

export type BudgetChildTable =
    | "budget_location"
    | "budget_section"
    | "budget_item"
    | "budget_block"
    | "budget_image";

function resolveBudgetIdFromChildRow(
    table: BudgetChildTable,
    row: Record<string, unknown>,
): string | null {
    if (table === "budget_location" || table === "budget_block" || table === "budget_image") {
        return recordIdToString(row.budget_id);
    }
    if (table === "budget_section") {
        const viaLocation = row.budget_id ?? row.location_id;
        if (viaLocation && typeof viaLocation === "object" && viaLocation !== null) {
            const loc = viaLocation as Record<string, unknown>;
            if ("budget_id" in loc) return recordIdToString(loc.budget_id);
        }
        return recordIdToString(row.budget_id ?? viaLocation);
    }
    const direct = recordIdToString(row.budget_id);
    if (direct) return direct;
    const section = row.section_id;
    if (section && typeof section === "object" && section !== null) {
        const sec = section as Record<string, unknown>;
        const loc = sec.location_id;
        if (loc && typeof loc === "object" && loc !== null) {
            return recordIdToString((loc as Record<string, unknown>).budget_id);
        }
        return recordIdToString(sec.budget_id);
    }
    const block = row.block_id;
    if (block && typeof block === "object" && block !== null) {
        return recordIdToString((block as Record<string, unknown>).budget_id);
    }
    return null;
}

const CHILD_SELECT: Record<BudgetChildTable, string> = {
    budget_location:
        "SELECT budget_id FROM budget_location WHERE id = $id AND deleted_at IS NONE LIMIT 1",
    budget_section:
        "SELECT location_id.budget_id AS budget_id FROM budget_section WHERE id = $id AND deleted_at IS NONE LIMIT 1",
    budget_item:
        "SELECT budget_id, section_id, block_id FROM budget_item WHERE id = $id AND deleted_at IS NONE LIMIT 1 FETCH section_id, block_id, section_id.location_id",
    budget_block:
        "SELECT budget_id FROM budget_block WHERE id = $id AND deleted_at IS NONE LIMIT 1",
    budget_image:
        "SELECT budget_id FROM budget_image WHERE id = $id AND deleted_at IS NONE LIMIT 1",
};

/** Valida que o orçamento pertence ao tenant informado (API routes / scripts). */
export async function assertBudgetBelongsToTenant(
    budgetId: string,
    tenantId: string,
    db?: Surreal,
): Promise<BudgetTenantGate> {
    try {
        const database = db ?? (await getDb());
        const budgetRecordId = requireRecordId("budget", budgetId);
        const res = await database.query<[Array<{ id?: unknown }>]>(
            "SELECT id FROM budget WHERE id = $id AND tenant_id = $tenantId LIMIT 1",
            { id: budgetRecordId, tenantId: tenantRecordId(tenantId) },
        );
        if (!res[0]?.[0]) {
            return { ok: false, error: BUDGET_NOT_FOUND };
        }
        return { ok: true, budgetId, budgetRecordId };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: BUDGET_NOT_FOUND };
    }
}

/** Valida que o orçamento pertence ao tenant ativo na sessão. */
export async function assertBudgetInActiveTenant(
    budgetId: string,
    db?: Surreal,
): Promise<BudgetTenantGate> {
    try {
        const tenantId = await requireActiveTenantId();
        return assertBudgetBelongsToTenant(budgetId, tenantId, db);
    } catch {
        return { ok: false, error: BUDGET_NOT_FOUND };
    }
}

/** Resolve o budget pai de um registro filho e valida tenant. */
export async function assertBudgetChildInActiveTenant(
    table: BudgetChildTable,
    childId: string,
    expectedBudgetId?: string,
    db?: Surreal,
): Promise<BudgetTenantGate> {
    try {
        const database = db ?? (await getDb());
        const childRecordId = requireRecordId(table, childId);
        const res = await database.query<[Array<Record<string, unknown>>]>(
            CHILD_SELECT[table],
            { id: childRecordId },
        );
        const row = res[0]?.[0];
        if (!row) {
            return { ok: false, error: BUDGET_NOT_FOUND };
        }
        const resolvedBudgetId = resolveBudgetIdFromChildRow(table, row);
        if (!resolvedBudgetId) {
            return { ok: false, error: BUDGET_NOT_FOUND };
        }
        if (expectedBudgetId && resolvedBudgetId !== expectedBudgetId) {
            return { ok: false, error: BUDGET_NOT_FOUND };
        }
        return assertBudgetInActiveTenant(resolvedBudgetId, database);
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: BUDGET_NOT_FOUND };
    }
}

/** Valida que todos os trechos pertencem a orçamentos do tenant ativo. */
export async function assertSectionsInActiveTenant(
    sectionIds: string[],
    db?: Surreal,
): Promise<{ ok: true } | { ok: false; error: string }> {
    if (sectionIds.length === 0) return { ok: true };
    try {
        const tenantId = await requireActiveTenantId();
        const database = db ?? (await getDb());
        const ids = sectionIds.map((id) => requireRecordId("budget_section", id));
        const res = await database.query<[Array<{ id?: unknown }>]>(
            `SELECT id FROM budget_section
             WHERE id IN $ids
             AND deleted_at IS NONE
             AND location_id.budget_id.tenant_id = $tenantId`,
            { ids, tenantId: tenantRecordId(tenantId) },
        );
        const found = res[0]?.length ?? 0;
        if (found !== sectionIds.length) {
            return { ok: false, error: BUDGET_NOT_FOUND };
        }
        return { ok: true };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { ok: false, error: e.message };
        }
        return { ok: false, error: BUDGET_NOT_FOUND };
    }
}

/** Filtra budget IDs editáveis do tenant ativo (sync de catálogo). */
export async function budgetBelongsToActiveTenant(
    budgetId: string,
    db?: Surreal,
): Promise<boolean> {
    const gate = await assertBudgetInActiveTenant(budgetId, db);
    return gate.ok;
}
