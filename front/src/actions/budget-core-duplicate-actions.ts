"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { getNextBudgetNumberAction } from "@/actions/budget-core-read-actions";
import { duplicateCompositorBlocks } from "@/actions/budget-core-duplicate-internals";
import { buildDuplicatedBudgetItemContent } from "@/actions/budget-hierarchy-helpers";

export async function duplicateBudgetAction(
    budgetId: string,
    newTitle?: string
): Promise<{ success: boolean; newBudgetId?: string; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);

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
            client_id: "",
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

        if (useCompositor) {
            await duplicateCompositorBlocks(db, budgetRecordId, newBudgetRecordId);

            const totalRes = await db.query<[{ grand_total: number }[]]>(
                "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
                { budgetId: newBudgetRecordId }
            );
            const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
            await db.update(newBudgetRecordId).merge({ total_value: grandTotal });
        } else {
            const locationsRes = await db.query<[Array<Record<string, unknown>>]>(
                "SELECT * FROM budget_location WHERE budget_id = $budgetId ORDER BY created_at ASC",
                { budgetId: budgetRecordId }
            );
            const locations = locationsRes?.[0] || [];

            for (const loc of locations) {
                const newLocRaw = await db.create(new Table("budget_location")).content({
                    budget_id: newBudgetRecordId,
                    name: loc.name,
                    description: loc.description,
                    order_index: loc.order_index,
                    show_costs_on_print: Boolean(loc.show_costs_on_print),
                    costs_display_mode:
                        loc.costs_display_mode === "location" || loc.costs_display_mode === "general"
                            ? loc.costs_display_mode
                            : "section",
                    price_adjustment_enabled: Boolean(loc.price_adjustment_enabled),
                    price_adjustment_input_mode:
                        loc.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
                    assembly_mode: loc.assembly_mode ?? "percent",
                    assembly_value: Number(loc.assembly_value ?? 0),
                    created_at: new Date().toISOString(),
                });
                const newLoc = Array.isArray(newLocRaw) ? newLocRaw[0] : newLocRaw;
                const newLocId = String(newLoc.id);
                const newLocRecordId = new StringRecordId(newLocId);
                const origLocRecordId = new StringRecordId(String(loc.id));

                const sectionsRes = await db.query<[Array<Record<string, unknown>>]>(
                    "SELECT * FROM budget_section WHERE location_id = $locId ORDER BY created_at ASC",
                    { locId: origLocRecordId }
                );
                const sections = sectionsRes?.[0] || [];

                for (const sec of sections) {
                    const newSecRaw = await db.create(new Table("budget_section")).content({
                        location_id: newLocRecordId,
                        budget_id: newBudgetRecordId,
                        name: sec.name,
                        description: sec.description,
                        order_index: sec.order_index,
                        show_costs_on_print: Boolean(sec.show_costs_on_print),
                        costs_display_mode:
                            sec.costs_display_mode === "location" || sec.costs_display_mode === "general"
                                ? sec.costs_display_mode
                                : "section",
                        price_adjustment_enabled: Boolean(sec.price_adjustment_enabled),
                        price_adjustment_input_mode:
                            sec.price_adjustment_input_mode === "percent" ? "percent" : "fixed",
                        assembly_mode:
                            sec.assembly_mode === "fixed" || sec.assembly_mode === "manual"
                                ? sec.assembly_mode
                                : "percent",
                        assembly_value: Number(sec.assembly_value ?? 0),
                        created_at: new Date().toISOString(),
                    });
                    const newSec = Array.isArray(newSecRaw) ? newSecRaw[0] : newSecRaw;
                    const newSecId = String(newSec.id);
                    const origSecRecordId = new StringRecordId(String(sec.id));

                    const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
                        "SELECT * FROM budget_item WHERE section_id = $secId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
                        { secId: origSecRecordId }
                    );
                    const items = itemsRes?.[0] || [];
                    for (const item of items) {
                        await db.create(new Table("budget_item")).content({
                            ...buildDuplicatedBudgetItemContent(item as Record<string, unknown>),
                            section_id: new StringRecordId(newSecId),
                            budget_id: newBudgetRecordId,
                        });
                    }
                }
            }

            const totalRes = await db.query<[{ grand_total: number }[]]>(
                "SELECT math::sum(total) as grand_total FROM budget_item WHERE section_id.budget_id = $budgetId GROUP ALL",
                { budgetId: newBudgetRecordId }
            );
            const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
            await db.update(newBudgetRecordId).merge({ total_value: grandTotal });
        }

        revalidatePath("/budgets");
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
