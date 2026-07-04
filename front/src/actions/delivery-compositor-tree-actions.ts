"use server";

import { assertWriteActionSession } from "@/actions/auth-actions";
import {
    ensureDeliveryCompositorCoverBlockAction,
    ensureDeliveryCompositorHeaderFooterBlockAction,
    ensureDeliveryCompositorTocBlockAction,
} from "@/actions/delivery-compositor-block-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { assertDeliveryProjectInActiveTenant } from "@/lib/delivery/delivery-compositor-tenant";
import type { BudgetBlockFlat } from "@/types/budget-compositor-types";

async function loadDeliveryCompositorTreeData(
    projectId: string,
    options: { ensureBlocks: boolean },
): Promise<{
    success: boolean;
    blocks?: BudgetBlockFlat[];
    items?: Record<string, never>;
    imagesByBlock?: Record<string, never>;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertDeliveryProjectInActiveTenant(projectId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        if (options.ensureBlocks) {
            await ensureDeliveryCompositorCoverBlockAction(projectId, { skipRevalidate: true });
            await ensureDeliveryCompositorHeaderFooterBlockAction(projectId, { skipRevalidate: true });
            await ensureDeliveryCompositorTocBlockAction(projectId, { skipRevalidate: true });
        }

        const blocksRes = await db.query<[BudgetBlockFlat[]]>(
            `SELECT * FROM delivery_block
             WHERE delivery_project_id = $projectId AND deleted_at IS NONE
             ORDER BY order_index ASC`,
            { projectId: gate.projectRecordId },
        );

        const blocks = (blocksRes[0] || [])
            .filter((b) => b.type !== "terms")
            .map((b) => ({
                ...b,
                id: String(b.id),
                budget_id: String(b.delivery_project_id ?? projectId),
                delivery_project_id: String(b.delivery_project_id ?? projectId),
                parent_id: b.parent_id ? String(b.parent_id) : null,
            })) as BudgetBlockFlat[];

        return { success: true, blocks, items: {}, imagesByBlock: {} };
    } catch (error) {
        console.error("loadDeliveryCompositorTreeData:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar compositor do DataBook" };
    }
}

export async function getDeliveryCompositorTreeAction(projectId: string) {
    return loadDeliveryCompositorTreeData(projectId, { ensureBlocks: true });
}

export async function getDeliveryCompositorTreeSnapshotAction(projectId: string) {
    return loadDeliveryCompositorTreeData(projectId, { ensureBlocks: false });
}
