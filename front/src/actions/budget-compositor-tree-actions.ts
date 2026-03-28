"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import type { BudgetBlockFlat } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { getBudgetImagesByBlocks } from "@/actions/budget-annotations";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import {
    ensureCompositorCoverBlockAction,
    ensureCompositorTocBlockAction,
} from "@/actions/budget-compositor-block-actions";

export async function getCompositorTreeAction(budgetId: string): Promise<{
    success: boolean;
    blocks?: BudgetBlockFlat[];
    items?: Record<string, BudgetItem[]>;
    imagesByBlock?: Record<string, unknown[]>;
    error?: string;
}> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);

        await ensureCompositorCoverBlockAction(budgetId);
        await ensureCompositorTocBlockAction(budgetId);

        const blocksRes = await db.query<[BudgetBlockFlat[]]>(
            "SELECT * FROM budget_block WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC",
            { budgetId: budgetRecordId }
        );

        const blocks = (blocksRes[0] || []).map((b) => ({
            ...b,
            id: String(b.id),
            budget_id: String(b.budget_id),
            parent_id: b.parent_id ? String(b.parent_id) : null,
        })) as BudgetBlockFlat[];

        const itemsByBlock: Record<string, BudgetItem[]> = {};
        if (blocks.length > 0) {
            try {
                const blockIds = blocks.map((b) => requireRecordId("budget_block", b.id));
                const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
                    "SELECT * FROM budget_item WHERE block_id INSIDE $blockIds AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id",
                    { blockIds }
                );
                for (const item of itemsRes[0] || []) {
                    const serialized = serializeBudgetEntity(item) as unknown as BudgetItem;
                    const blockId = String(item.block_id);
                    if (!itemsByBlock[blockId]) itemsByBlock[blockId] = [];
                    itemsByBlock[blockId].push(serialized);
                }
            } catch (itemsError) {
                console.warn("getCompositorTreeAction: falha ao carregar itens (não crítico):", itemsError);
            }
        }

        let imagesByBlock: Record<string, unknown[]> = {};
        if (blocks.length > 0) {
            try {
                imagesByBlock = await getBudgetImagesByBlocks(blocks.map((b) => b.id));
            } catch (imagesError) {
                console.warn("getCompositorTreeAction: falha ao carregar imagens (não crítico):", imagesError);
            }
        }

        return {
            success: true,
            blocks: toPlain(blocks),
            items: toPlain(itemsByBlock),
            imagesByBlock: toPlain(imagesByBlock),
        };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getCompositorTreeAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar árvore do documento" };
    }
}
