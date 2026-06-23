"use server";

import { Table } from "surrealdb";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import {
    InvalidRecordIdError,
    canonicalTableRecordId,
    requireRecordId,
    safeStringRecordId,
} from "@/lib/surreal-record-ids";
import { assertBudgetChildInActiveTenant } from "@/lib/budget-tenant";
import { auditTenantAction } from "@/lib/audit-log";

async function recalculateCompositorTotal(db: Awaited<ReturnType<typeof getDb>>, budgetId: string) {
    const budgetRecordId = requireRecordId("budget", budgetId);
    try {
        const result = await db.query<[{ grand_total: number }[]]>(
            "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
            { budgetId: budgetRecordId }
        );
        const grandTotal = result[0]?.[0]?.grand_total || 0;
        await db.update(budgetRecordId).merge({ total_value: grandTotal, updated_at: new Date().toISOString() });
    } catch (e) {
        console.error("recalculateCompositorTotal error:", e);
    }
}

async function nextOrderIndex(db: Awaited<ReturnType<typeof getDb>>, blockId: string): Promise<number> {
    try {
        const res = await db.query<[Array<{ order_index: number }>]>(
            "SELECT order_index FROM budget_item WHERE block_id = $blockId ORDER BY order_index DESC LIMIT 1",
            { blockId: requireRecordId("budget_block", blockId) }
        );
        return (res[0]?.[0]?.order_index ?? -1) + 1;
    } catch {
        return Date.now();
    }
}

export async function addItemToBlockAction(
    blockId: string,
    budgetId: string,
    productId: string,
    quantity: number
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_block", blockId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const productResult = await db.select(productRecordId);
        const product = (Array.isArray(productResult) ? productResult[0] : productResult) as Record<
            string,
            unknown
        >;
        if (!product) throw new Error("Produto não encontrado");

        const unitPrice = Number(product.equipmentPrice || 0);
        const laborCost = Number(product.assemblyPrice || 0);
        const orderIndex = await nextOrderIndex(db, blockId);

        await db.create(new Table("budget_item")).content({
            block_id: requireRecordId("budget_block", blockId),
            budget_id: requireRecordId("budget", budgetId),
            product_id: productRecordId,
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            total: (unitPrice + laborCost) * quantity,
            order_index: orderIndex,
            created_at: new Date().toISOString(),
        });

        await recalculateCompositorTotal(db, budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.add",
            resourceType: "budget_block",
            resourceId: blockId,
            summary: "Item adicionado ao bloco do compositor",
            metadata: { budgetId, productId },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("addItemToBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao adicionar item" };
    }
}

export async function addGroupToBlockAction(
    blockId: string,
    budgetId: string,
    groupId: string,
    groupName: string,
    productQuantities: Record<string, number>,
    selectedProductIds: string[]
): Promise<{ success: boolean; error?: string; addedCount?: number }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error, addedCount: 0 };

    const groupRecordId = safeStringRecordId("product_group", groupId);
    if (!groupRecordId) {
        return { success: false, error: "Identificador inválido", addedCount: 0 };
    }

    const gate = await assertBudgetChildInActiveTenant("budget_block", blockId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error, addedCount: 0 };

    const db = await getDb();
    try {
        const { getProductGroupProductsAction } = await import("@/actions/product-group-actions");
        const productsRes = await getProductGroupProductsAction(groupId);
        if (!productsRes.success || !productsRes.data?.length) {
            return { success: false, error: "Este grupo não possui produtos cadastrados.", addedCount: 0 };
        }

        const selectedSet = new Set(
            selectedProductIds.map((id) => canonicalTableRecordId("product", id)).filter(Boolean)
        );
        const normalizedQty: Record<string, number> = {};
        for (const [k, v] of Object.entries(productQuantities)) {
            const canon = canonicalTableRecordId("product", k);
            if (canon) normalizedQty[canon] = v;
        }

        let orderIndex = await nextOrderIndex(db, blockId);
        const groupInstanceId = crypto.randomUUID();
        let inserted = 0;
        for (const product of productsRes.data) {
            const productId = canonicalTableRecordId("product", product.id);
            if (!productId || !selectedSet.has(productId)) continue;

            const unitPrice = Number(product.equipmentPrice || 0);
            const laborCost = Number(product.assemblyPrice || 0);
            const quantity = Math.max(1, normalizedQty[productId] ?? 1);

            await db.create(new Table("budget_item")).content({
                block_id: requireRecordId("budget_block", blockId),
                budget_id: requireRecordId("budget", budgetId),
                product_id: requireRecordId("product", productId),
                quantity,
                unit_price: unitPrice,
                labor_cost: laborCost,
                total: (unitPrice + laborCost) * quantity,
                group_id: groupRecordId,
                group_name: groupName,
                group_instance_id: groupInstanceId,
                order_index: orderIndex++,
                created_at: new Date().toISOString(),
            });
            inserted += 1;
        }

        if (inserted === 0 && selectedProductIds.length > 0) {
            return {
                success: false,
                error:
                    "Não foi possível associar os produtos selecionados. Atualize a página e tente novamente.",
                addedCount: 0,
            };
        }

        await recalculateCompositorTotal(db, budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.add_group",
            resourceType: "budget_block",
            resourceId: blockId,
            summary: `Grupo adicionado ao bloco (${inserted} item(ns))`,
            metadata: { budgetId, groupId, addedCount: inserted },
        });
        return { success: true, addedCount: inserted };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message, addedCount: 0 };
        }
        console.error("addGroupToBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao adicionar grupo", addedCount: 0 };
    }
}

export async function deleteItemFromBlockAction(
    itemId: string,
    budgetId: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        await db.update(requireRecordId("budget_item", itemId)).merge({ deleted_at: new Date().toISOString() });
        await recalculateCompositorTotal(db, budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.delete",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Item removido do bloco do compositor",
            metadata: { budgetId },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("deleteItemFromBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover item" };
    }
}

export async function updateItemQuantityInBlockAction(
    itemId: string,
    budgetId: string,
    quantity: number
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const raw = await db.select(itemRecordId);
        const item = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
        if (!item) throw new Error("Item não encontrado");

        const unitPrice = Number(item.unit_price) || 0;
        const laborCost = Number(item.labor_cost) || 0;
        await db.update(itemRecordId).merge({ quantity, total: (unitPrice + laborCost) * quantity });

        await recalculateCompositorTotal(db, budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_quantity",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Quantidade do item atualizada no compositor",
            metadata: { budgetId, quantity },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemQuantityInBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar quantidade" };
    }
}

export async function updateItemGroupInBlockAction(
    itemId: string,
    budgetId: string,
    groupId: string | null,
    groupName?: string
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_item", itemId, budgetId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        if (groupId === null) {
            await db.query(
                "UPDATE $item SET group_id = NONE, group_name = NONE, group_instance_id = NONE",
                { item: itemRecordId }
            );
        } else {
            const groupRecordId = requireRecordId("product_group", groupId);
            await db.update(itemRecordId).merge({
                group_id: groupRecordId,
                group_name: groupName ?? "",
            });
            await db.query("UPDATE $item SET group_instance_id = NONE", { item: itemRecordId });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        await auditTenantAction({
            action: "budget_item.update_group",
            resourceType: "budget_item",
            resourceId: itemId,
            summary: "Grupo do item atualizado no compositor",
            metadata: { budgetId, groupId },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemGroupInBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar grupo do item" };
    }
}

export async function reorderItemsInBlockAction(
    _blockId: string,
    itemIds: string[]
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const gate = await assertBudgetChildInActiveTenant("budget_block", _blockId);
    if (!gate.ok) return { success: false, error: gate.error };

    const db = await getDb();
    try {
        for (let i = 0; i < itemIds.length; i++) {
            await db.update(requireRecordId("budget_item", itemIds[i])).merge({ order_index: i });
        }
        await auditTenantAction({
            action: "budget_item.reorder",
            resourceType: "budget_block",
            resourceId: _blockId,
            summary: "Itens reordenados no bloco do compositor",
            metadata: { count: itemIds.length },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("reorderItemsInBlockAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar itens" };
    }
}
