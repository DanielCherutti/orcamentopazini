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
import { isBudgetEditableStatus } from "@/lib/budgets/budget-status";
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
            if (!isBudgetEditableStatus(currentStatus)) {
                return {
                    success: false,
                    error: "Este orçamento está finalizado ou fechado e não pode ser alterado.",
                };
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

function nestedBudgetFromItem(item: Record<string, unknown>): Record<string, unknown> | null {
    const block = item.block_id;
    if (block && typeof block === "object" && !Array.isArray(block)) {
        const b = block as Record<string, unknown>;
        const budget = b.budget_id;
        if (budget && typeof budget === "object" && !Array.isArray(budget)) {
            return budget as Record<string, unknown>;
        }
    }
    const section = item.section_id;
    if (section && typeof section === "object" && !Array.isArray(section)) {
        const s = section as Record<string, unknown>;
        const budget = s.budget_id;
        if (budget && typeof budget === "object" && !Array.isArray(budget)) {
            return budget as Record<string, unknown>;
        }
    }
    return null;
}

function budgetIdStringFromRecord(budget: Record<string, unknown>): string | null {
    const id = budget.id;
    if (id == null) return null;
    return String(id);
}

/** Recalcula total do orçamento somando itens ligados por bloco (compositor) e por trecho (legado). */
async function recalculateBudgetTotalCombined(
    db: Awaited<ReturnType<typeof getDb>>,
    budgetId: string
): Promise<void> {
    const budgetRecordId = requireRecordId("budget", budgetId);
    let sum = 0;
    const queries: [string, Record<string, unknown>][] = [
        [
            "SELECT math::sum(total) AS grand_total FROM budget_item WHERE block_id.budget_id = $bid AND deleted_at IS NONE GROUP ALL",
            { bid: budgetRecordId },
        ],
        [
            "SELECT math::sum(total) AS grand_total FROM budget_item WHERE section_id.budget_id = $bid AND deleted_at IS NONE GROUP ALL",
            { bid: budgetRecordId },
        ],
    ];
    for (const [q, vars] of queries) {
        try {
            const res = await db.query<[{ grand_total: number | null }[]]>(q, vars);
            const g = res[0]?.[0]?.grand_total;
            if (g != null && !Number.isNaN(Number(g))) sum += Number(g);
        } catch {
            /* consulta pode falhar em esquemas antigos — ignora */
        }
    }
    await db.update(budgetRecordId).merge({
        total_value: sum,
        updated_at: new Date().toISOString(),
    });
}

/**
 * Após alterar preço de equipamento / mão de obra no cadastro do produto,
 * propaga `unit_price`, `labor_cost` e `total` nos itens de orçamentos em **rascunho** (não fechados).
 */
export async function syncProductPricesToDraftBudgetsAction(
    productId: string,
    unitPrice: number,
    laborCost: number
): Promise<{ success: boolean; updatedItems: number; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, updatedItems: 0, error: auth.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE product_id = $pid AND deleted_at IS NONE FETCH block_id, section_id, block_id.budget_id, section_id.budget_id",
            { pid: productRecordId }
        );
        const items = itemsRes[0] || [];
        const budgetIdsToRecalc = new Set<string>();
        let updatedItems = 0;

        for (const item of items) {
            const budget = nestedBudgetFromItem(item);
            if (!budget) continue;
            const status = String(budget.status ?? "");
            if (status !== "draft") continue;

            const curU = Number(item.unit_price ?? 0);
            const curL = Number(item.labor_cost ?? 0);
            if (curU === unitPrice && curL === laborCost) continue;

            const qty = Math.max(1, Number(item.quantity || 1));
            const newTotal = (unitPrice + laborCost) * qty;
            const itemRecordId = requireRecordId("budget_item", String(item.id));

            await db.update(itemRecordId).merge({
                unit_price: unitPrice,
                labor_cost: laborCost,
                total: newTotal,
            });
            updatedItems++;

            const bid = budgetIdStringFromRecord(budget);
            if (bid) budgetIdsToRecalc.add(bid);
        }

        for (const bid of budgetIdsToRecalc) {
            await recalculateBudgetTotalCombined(db, bid);
            revalidatePath(budgetRevalidatePath(bid));
        }

        if (updatedItems > 0) {
            revalidatePath("/budgets");
        }

        return { success: true, updatedItems };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, updatedItems: 0, error: error.message };
        }
        console.error("syncProductPricesToDraftBudgetsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, updatedItems: 0, error: "Erro ao propagar preços aos orçamentos" };
    }
}
