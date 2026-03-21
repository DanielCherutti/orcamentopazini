"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { Budget } from "@/types/budget-types";
import { addBlockAction } from "@/actions/budget-compositor-block-actions";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";

export async function createBudgetAction(title: string, code: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const numberResult = await getNextBudgetNumberAction();
        if (!numberResult.success || !numberResult.data) {
            return { success: false, error: numberResult.error };
        }

        const budgetData = {
            title: title || numberResult.data.formattedCode,
            code: code || numberResult.data.nextNumber,
            status: "draft" as const,
            total_value: 0,
            client_id: "",
            use_compositor: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        const result = await db.create(new Table("budget")).content(budgetData);
        const createdRecord = Array.isArray(result) ? result[0] : result;
        const createdBudget = {
            ...createdRecord,
            id: String(createdRecord.id),
        } as Budget;

        await addBlockAction({ budgetId: createdBudget.id!, parentId: null, type: "scope", label: "ESCOPO" });

        revalidatePath("/budgets");

        return { success: true, data: toPlain(createdBudget) };
    } catch (error) {
        console.error("Error creating budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao criar orçamento" };
    }
}

export async function updateBudgetAction(budgetId: string, updates: Partial<Budget>) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const allowedFields = [
            "client_id",
            "title",
            "description",
            "status",
            "section_number",
            "payment_terms",
            "delivery_time",
            "validity_days",
            "issue_date",
        ];

        const budgetRecordId = requireRecordId("budget", budgetId);

        const safeUpdates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };

        Object.keys(updates).forEach((key) => {
            if (allowedFields.includes(key) && updates[key as keyof Budget] !== undefined) {
                safeUpdates[key] = updates[key as keyof Budget];
            }
        });

        if (
            safeUpdates.client_id !== undefined &&
            safeUpdates.client_id !== null &&
            safeUpdates.client_id !== ""
        ) {
            const rawClientId = safeUpdates.client_id;
            if (
                typeof rawClientId === "object" &&
                rawClientId !== null &&
                "id" in (rawClientId as Record<string, unknown>)
            ) {
                safeUpdates.client_id = new StringRecordId(
                    String((rawClientId as Record<string, unknown>).id)
                );
            } else if (typeof rawClientId === "string" && rawClientId.trim().length > 0) {
                safeUpdates.client_id = requireRecordId("client", rawClientId);
            }
        }

        const structuralKeys = Object.keys(safeUpdates).filter((k) => k !== "updated_at" && k !== "status");

        if (structuralKeys.length > 0) {
            const currentRaw = await db.select(budgetRecordId);
            const currentBudget = (Array.isArray(currentRaw) ? currentRaw[0] : currentRaw) as Record<
                string,
                unknown
            >;
            const currentStatus = currentBudget?.status as string;
            if (["sent", "approved", "rejected"].includes(currentStatus)) {
                return { success: false, error: "Orçamento enviado não pode ser editado." };
            }
        }

        await db.update(budgetRecordId).merge(safeUpdates);

        revalidatePath(budgetRevalidatePath(budgetId));
        revalidatePath("/budgets");

        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao atualizar orçamento" };
    }
}

export async function deleteBudgetAction(budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await db.delete(requireRecordId("budget", budgetId));
        revalidatePath("/budgets");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting budget:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao excluir orçamento" };
    }
}

export async function syncDraftPricesAction(
    budgetId: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, updatedCount: 0, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);

        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE block_id.budget_id = $budgetId FETCH product_id",
            { budgetId: budgetRecordId }
        );
        const items = itemsRes[0] || [];

        let updatedCount = 0;
        for (const item of items) {
            const product = item.product_id as Record<string, unknown> | null;
            if (!product) continue;

            const currentUnitPrice = Number(product.equipmentPrice || 0);
            const currentLaborCost = Number(product.assemblyPrice || 0);
            const storedUnitPrice = Number(item.unit_price || 0);
            const storedLaborCost = Number(item.labor_cost || 0);

            if (currentUnitPrice !== storedUnitPrice || currentLaborCost !== storedLaborCost) {
                const quantity = Number(item.quantity || 1);
                const itemRecordId = requireRecordId("budget_item", String(item.id));
                await db.update(itemRecordId).merge({
                    unit_price: currentUnitPrice,
                    labor_cost: currentLaborCost,
                    total: (currentUnitPrice + currentLaborCost) * quantity,
                });
                updatedCount++;
            }
        }

        if (updatedCount > 0) {
            const totalRes = await db.query<[{ grand_total: number }[]]>(
                "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
                { budgetId: budgetRecordId }
            );
            const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
            await db
                .update(budgetRecordId)
                .merge({ total_value: grandTotal, updated_at: new Date().toISOString() });
        }

        return { success: true, updatedCount };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, updatedCount: 0, error: error.message };
        }
        console.error("syncDraftPricesAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, updatedCount: 0, error: "Erro ao sincronizar preços" };
    }
}
