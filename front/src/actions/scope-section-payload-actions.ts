"use server";

import { assertWriteActionSession } from "@/actions/auth-actions";
import { toPlain } from "@/lib/surreal";
import { getBudgetItemsBySectionIdsLightAction } from "@/actions/budget-hierarchy-section-items-actions";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";
import { getBudgetImagesBySection } from "@/actions/budget-annotations";
import { assertBudgetChildInActiveTenant } from "@/lib/budget-tenant";

/**
 * Um round-trip cliente → servidor: itens leves do trecho (sem FETCH product) + imagens.
 */
export async function getScopeSectionOpenPayloadAction(sectionId: string): Promise<{
    success: boolean;
    data?: { items: unknown[]; images: unknown[] };
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_section", sectionId);
    if (!gate.ok) return { success: false, error: gate.error };

    const [itemsRes, imagesRaw] = await Promise.all([
        getBudgetItemsBySectionIdsLightAction([sectionId]),
        getBudgetImagesBySection(sectionId),
    ]);

    if (!itemsRes.success) {
        return { success: false, error: itemsRes.error ?? "Erro ao carregar itens" };
    }

    const items = budgetItemsFromGroupedBySectionId(itemsRes.data, sectionId, {
        trustSingleBucket: true,
    });
    return {
        success: true,
        data: toPlain({ items, images: imagesRaw ?? [] }),
    };
}
