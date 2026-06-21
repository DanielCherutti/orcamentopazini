"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { auditTenantAction } from "@/lib/audit-log";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";
import {
    duplicateBudgetStructure,
    recalculateBudgetTotalValue,
} from "@/actions/budget-core-duplicate-internals";

function resolveRelationId(value: unknown): string {
    if (!value) return "";
    if (typeof value === "object" && value !== null && "id" in (value as Record<string, unknown>)) {
        return String((value as Record<string, unknown>).id);
    }
    return String(value);
}

export async function duplicateBudgetAction(
    budgetId: string,
    newTitle?: string
): Promise<{ success: boolean; newBudgetId?: string; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const gate = await assertBudgetInActiveTenant(budgetId, db);
        if (!gate.ok) return { success: false, error: gate.error };

        const budgetRecordId = gate.budgetRecordId;
        const tenantId = await requireActiveTenantId();

        const originalRes = await db.query<[Array<Record<string, unknown>>]>("SELECT * FROM $id", {
            id: budgetRecordId,
        });
        const original = originalRes[0]?.[0];
        if (!original) return { success: false, error: "Orçamento não encontrado" };

        const useCompositor = !!original.use_compositor;

        const numberResult = await getNextBudgetNumberAction();
        const nextCode = numberResult.data?.nextNumber ?? String(Date.now());
        const newBudgetRaw = await db.create(new Table("budget")).content({
            title: newTitle || `${original.title || original.code || "Orçamento"} - Cópia`,
            code: nextCode,
            status: "draft",
            total_value: 0,
            client_id: resolveRelationId(original.client_id),
            tenant_id: tenantRecordId(tenantId),
            use_compositor: useCompositor,
            description: original.description,
            payment_terms: original.payment_terms,
            delivery_time: original.delivery_time,
            validity_days: original.validity_days,
            section_number: original.section_number,
            show_costs_on_print: original.show_costs_on_print ?? false,
            costs_display_mode: original.costs_display_mode ?? "section",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const newBudget = Array.isArray(newBudgetRaw) ? newBudgetRaw[0] : newBudgetRaw;
        const newBudgetId = String(newBudget.id);
        const newBudgetRecordId = new StringRecordId(newBudgetId);

        await duplicateBudgetStructure(db, budgetRecordId, newBudgetRecordId, useCompositor);
        await recalculateBudgetTotalValue(db, newBudgetRecordId, useCompositor);

        revalidatePath("/budgets");
        await auditTenantAction({
            action: "budget.duplicate",
            resourceType: "budget",
            resourceId: newBudgetId,
            summary: `Orçamento duplicado a partir de ${budgetId}`,
            metadata: { sourceBudgetId: budgetId },
        });
        return { success: true, newBudgetId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error duplicating budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao duplicar orçamento" };
    }
}
