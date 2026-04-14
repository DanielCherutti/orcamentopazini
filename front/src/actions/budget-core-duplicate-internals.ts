import { Table, StringRecordId } from "surrealdb";
import { buildDuplicatedBudgetItemContent } from "@/actions/budget-hierarchy-helpers";

type BudgetDb = Awaited<ReturnType<typeof import("@/lib/surreal").getDb>>;

/** Copia árvore de blocos do compositor e itens (uso interno em duplicateBudget). */
export async function duplicateCompositorBlocks(
    db: BudgetDb,
    originalBudgetRecordId: StringRecordId,
    newBudgetRecordId: StringRecordId
) {
    const blocksRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM budget_block WHERE budget_id = $budgetId ORDER BY order_index ASC",
        { budgetId: originalBudgetRecordId }
    );
    const flatBlocks = blocksRes[0] || [];
    if (flatBlocks.length === 0) return;

    const oldToNew = new Map<string, StringRecordId>();

    const pending = [...flatBlocks];
    let maxPasses = pending.length + 1;

    while (pending.length > 0 && maxPasses-- > 0) {
        const batch: typeof pending = [];
        const remaining: typeof pending = [];

        for (const block of pending) {
            const origParentId = block.parent_id ? String(block.parent_id) : null;
            if (!origParentId || oldToNew.has(origParentId)) {
                batch.push(block);
            } else {
                remaining.push(block);
            }
        }

        for (const block of batch) {
            const origParentId = block.parent_id ? String(block.parent_id) : null;
            const newParentRecordId = origParentId ? oldToNew.get(origParentId) : undefined;

            const newBlockRaw = await db.create(new Table("budget_block")).content({
                budget_id: newBudgetRecordId,
                ...(newParentRecordId ? { parent_id: newParentRecordId } : {}),
                type: block.type,
                label: block.label,
                order_index: block.order_index,
                props: block.props ?? {},
            });
            const newBlock = Array.isArray(newBlockRaw) ? newBlockRaw[0] : newBlockRaw;
            oldToNew.set(String(block.id), new StringRecordId(String(newBlock.id)));
        }

        pending.splice(0, pending.length, ...remaining);
    }

    for (const [origBlockId, newBlockRecordId] of oldToNew.entries()) {
        const origBlockRecordId = new StringRecordId(origBlockId);
        const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE block_id = $blockId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
            { blockId: origBlockRecordId }
        );
        const items = itemsRes[0] || [];
        for (const item of items) {
            await db.create(new Table("budget_item")).content({
                ...buildDuplicatedBudgetItemContent(item),
                block_id: newBlockRecordId,
                budget_id: newBudgetRecordId,
            });
        }
    }
}
