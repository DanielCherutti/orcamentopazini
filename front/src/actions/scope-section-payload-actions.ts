"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { toPlain } from "@/lib/surreal";
import { getBudgetItemsBySectionIdsLightAction } from "@/actions/budget-hierarchy-section-items-actions";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";
import { getBudgetImagesBySection } from "@/actions/budget-annotations";

/**
 * Um round-trip cliente → servidor: itens leves do trecho (sem FETCH product) + imagens.
 */
export async function getScopeSectionOpenPayloadAction(sectionId: string): Promise<{
    success: boolean;
    data?: { items: unknown[]; images: unknown[] };
    error?: string;
}> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const [itemsRes, imagesRaw] = await Promise.all([
        getBudgetItemsBySectionIdsLightAction([sectionId]),
        getBudgetImagesBySection(sectionId),
    ]);

    if (!itemsRes.success) {
        return { success: false, error: itemsRes.error ?? "Erro ao carregar itens" };
    }

    const items = budgetItemsFromGroupedBySectionId(itemsRes.data, sectionId);
    return {
        success: true,
        data: toPlain({ items, images: imagesRaw ?? [] }),
    };
}
