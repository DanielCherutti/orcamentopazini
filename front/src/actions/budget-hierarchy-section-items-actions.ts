"use server";

import { revalidatePath } from "next/cache";
import { Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { BudgetItem } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { getProductGroupProductsAction } from "@/actions/product-group-actions";
import {
    InvalidRecordIdError,
    canonicalTableRecordId,
    recordIdToString,
    requireRecordId,
    safeStringRecordId,
} from "@/lib/surreal-record-ids";
import { extractProductId, recalculateBudgetTotal } from "@/actions/budget-hierarchy-helpers";
import { computeItemSubtotal, type PriceAdjustmentMode } from "@/lib/budgets/scope-pricing";

/** Próximo `order_index` na seção (múltiplos de 10, alinhado a `reorderSectionItemsAction`). */
async function nextSectionItemOrderIndex(
    db: Awaited<ReturnType<typeof getDb>>,
    sectionId: string
): Promise<number> {
    const sectionRecordId = requireRecordId("budget_section", sectionId);
    try {
        const res = await db.query<[Array<{ m: number | null }>]>(
            `SELECT math::max(order_index) AS m FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE GROUP ALL`,
            { sectionId: sectionRecordId }
        );
        const max = res[0]?.[0]?.m;
        const n = max == null || Number.isNaN(Number(max)) ? -10 : Number(max);
        return n + 10;
    } catch {
        return 0;
    }
}

/**
 * Sempre cria uma nova linha no escopo (mesmo produto repetido = linhas separadas).
 */
async function createBudgetItemInSection(
    db: Awaited<ReturnType<typeof getDb>>,
    sectionId: string,
    productId: string,
    productName: string,
    unitPrice: number,
    laborCost: number,
    quantity: number,
    productUnit?: string
): Promise<string> {
    const unitLabel = productUnit?.trim();
    const orderIndex = await nextSectionItemOrderIndex(db, sectionId);
    const computedTotal = computeItemSubtotal({
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        price_adjustment_mode: null,
        price_adjustment_value: 0,
        observation_extra_value: 0,
    });
    const raw = await db.create(new Table("budget_item")).content({
        section_id: requireRecordId("budget_section", sectionId),
        product_id: requireRecordId("product", productId),
        product_name: productName,
        ...(unitLabel ? { product_unit: unitLabel } : {}),
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        total: computedTotal,
        observation_text: "",
        observation_show_on_print: false,
        labor_show_on_print: false,
        observation_extra_value: 0,
        price_adjustment_mode: null,
        price_adjustment_value: 0,
        assembly_manual_value: 0,
        order_index: orderIndex,
        created_at: new Date().toISOString(),
    });
    const created = Array.isArray(raw) ? raw[0] : raw;
    if (!created?.id) throw new Error("Falha ao obter id do item criado");
    return String(created.id);
}

/**
 * Serialização compartilhada para linhas de `budget_item` vindas do Surreal (uma seção ou orçamento inteiro).
 */
async function serializeBudgetItemsFromRawQueryRows(
    db: Awaited<ReturnType<typeof getDb>>,
    rawRows: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
    let items = rawRows.map((item) => {
        const serialized = serializeBudgetEntity(item);
        const productSource =
            serialized.product_data ??
            (typeof serialized.product_id === "object" ? serialized.product_id : null);
        if (productSource && typeof productSource === "object") {
            const pd = { ...(productSource as Record<string, unknown>) };
            if (pd.id) pd.id = String(pd.id);
            if (pd.company_id) pd.company_id = String(pd.company_id);
            if (pd.created_at) pd.created_at = String(pd.created_at);
            if (pd.updated_at) pd.updated_at = String(pd.updated_at);
            if (Array.isArray(pd.group_ids)) {
                pd.group_ids = (pd.group_ids as unknown[]).map((g) =>
                    typeof g === "object" && g !== null ? String(g) : g
                );
            }
            if (Array.isArray(pd.attachments)) {
                pd.attachments = (pd.attachments as unknown[]).map((a) =>
                    typeof a === "object" && a !== null
                        ? serializeBudgetEntity(a as Record<string, unknown>)
                        : a
                );
            }
            serialized.product_data = pd;
        }
        return serialized;
    });

    const needFetch = items.filter((it) => {
        const pd = (it as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
        const productId = extractProductId((it as Record<string, unknown>).product_id);
        return productId != null && !pd?.description && !pd?.name && !pd?.code;
    });
    if (needFetch.length > 0) {
        const productIds = [
            ...new Set(
                needFetch
                    .map((it) => extractProductId((it as Record<string, unknown>).product_id))
                    .filter(Boolean)
            ),
        ] as string[];
        const productsMap = new Map<string, Record<string, unknown>>();
        for (const rawId of productIds) {
            const cleanId = rawId.replace(/^product:/, "");
            const pr = safeStringRecordId("product", cleanId);
            if (!pr) continue;
            try {
                const res = await db.select(pr);
                const p = Array.isArray(res) ? res[0] : res;
                if (p && typeof p === "object") {
                    const prod = p as Record<string, unknown>;
                    productsMap.set(rawId, prod);
                    productsMap.set(cleanId, prod);
                    productsMap.set(`product:${cleanId}`, prod);
                }
            } catch {
                // produto pode ter sido deletado
            }
        }
        items = items.map((it) => {
            const pd = (it as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
            if (pd?.description || pd?.name || pd?.code) return it;
            const productId = extractProductId((it as Record<string, unknown>).product_id);
            if (!productId) return it;
            const product =
                productsMap.get(productId) ?? productsMap.get(productId.replace(/^product:/, ""));
            if (product) {
                (it as Record<string, unknown>).product_data = {
                    id: String(product.id),
                    code: product.code,
                    description: product.description ?? product.name,
                    name: product.name,
                    unit: product.unit,
                };
            }
            return it;
        });
    }

    items = items.map((it) => {
        const r = it as Record<string, unknown>;
        const pd = r.product_data as Record<string, unknown> | undefined;
        if (!r.product_name) {
            const resolved = String(pd?.description ?? pd?.name ?? pd?.code ?? "");
            if (resolved) r.product_name = resolved;
        }
        const u = pd?.unit;
        if (u != null && String(u).trim() !== "" && !r.product_unit) {
            r.product_unit = String(u);
        }
        return it;
    });

    return items;
}

export async function getItemsBySectionAction(sectionId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const sectionRecordId = requireRecordId("budget_section", sectionId);
        const result = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
            { sectionId: sectionRecordId }
        );
        const items = await serializeBudgetItemsFromRawQueryRows(db, result?.[0] || []);
        return { success: true, data: toPlain(items) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getItemsBySectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens" };
    }
}

/**
 * Carrega todos os itens do orçamento numa única query e agrupa por trecho.
 * Evita centenas de round-trips (`getItemsBySectionAction` por trecho) no índice do escopo.
 */
export async function getBudgetItemsGroupedByBudgetIdAction(budgetId: string): Promise<{
    success: boolean;
    data?: Record<string, BudgetItem[]>;
    error?: string;
}> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);
        /** Preferir cadeia local → orçamento; trechos sem `budget_id` não casam em `section_id.budget_id`. */
        let rawRows = (
            await db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM budget_item WHERE section_id.location_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
                { budgetId: budgetRecordId }
            )
        )?.[0] ?? [];
        if (rawRows.length === 0) {
            rawRows =
                (
                    await db.query<[Array<Record<string, unknown>>]>(
                        `SELECT * FROM budget_item WHERE section_id.budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id`,
                        { budgetId: budgetRecordId }
                    )
                )?.[0] ?? [];
        }
        const rows = await serializeBudgetItemsFromRawQueryRows(db, rawRows);
        const plain = toPlain(rows) as BudgetItem[];
        const grouped: Record<string, BudgetItem[]> = {};
        for (const it of plain) {
            const r = it as unknown as Record<string, unknown>;
            const sid = canonicalTableRecordId("budget_section", r.section_id);
            if (!sid) continue;
            if (!grouped[sid]) grouped[sid] = [];
            grouped[sid].push(it);
        }
        return { success: true, data: grouped };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetItemsGroupedByBudgetIdAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar itens do orçamento" };
    }
}

export async function addItemAction(sectionId: string, budgetId: string, productId: string, quantity: number) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const productRecordId = requireRecordId("product", productId);
        const productResult = await db.select(productRecordId);
        const product = Array.isArray(productResult) ? productResult[0] : productResult;
        if (!product) throw new Error("Produto não encontrado");

        const unitPrice = Number(product.equipmentPrice || 0);
        const laborCost = Number(product.assemblyPrice || 0);
        const productName = String(product.description || product.code || "");
        const productUnit = String((product as Record<string, unknown>).unit ?? "").trim();

        const newItemId = await createBudgetItemInSection(
            db,
            sectionId,
            productId,
            productName,
            unitPrice,
            laborCost,
            quantity,
            productUnit || undefined
        );

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, itemId: newItemId };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error adding item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar item" };
    }
}

export async function addGroupToSectionAction(
    sectionId: string,
    budgetId: string,
    groupId: string,
    groupName: string,
    productQuantities: Record<string, number>,
    selectedProductIds: string[]
) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error, addedCount: 0 };

    const groupRecordId = safeStringRecordId("product_group", groupId);
    if (!groupRecordId) {
        return { success: false, error: "Identificador inválido", addedCount: 0 };
    }

    const productsRes = await getProductGroupProductsAction(groupId);
    if (!productsRes.success || !productsRes.data?.length) {
        return { success: false, error: "Este grupo não possui produtos cadastrados.", addedCount: 0 };
    }

    const db = await getDb();
    try {
        const selectedSet = new Set(
            selectedProductIds.map((id) => canonicalTableRecordId("product", id)).filter(Boolean)
        );
        const normalizedQty: Record<string, number> = {};
        for (const [k, v] of Object.entries(productQuantities)) {
            const canon = canonicalTableRecordId("product", k);
            if (canon) normalizedQty[canon] = v;
        }

        let orderIndex = await nextSectionItemOrderIndex(db, sectionId);
        const groupInstanceId = crypto.randomUUID();

        let inserted = 0;
        for (const product of productsRes.data) {
            const productId = canonicalTableRecordId("product", product.id);
            if (!productId || !selectedSet.has(productId)) continue;

            const unitPrice = Number(product.equipmentPrice || 0);
            const laborCost = Number(product.assemblyPrice || 0);
            const quantity = Math.max(1, normalizedQty[productId] ?? 1);
            const productName = String(product.description || product.code || "");
            const productUnit = String(product.unit ?? "").trim();

            await db.create(new Table("budget_item")).content({
                section_id: requireRecordId("budget_section", sectionId),
                product_id: requireRecordId("product", productId),
                product_name: productName,
                ...(productUnit ? { product_unit: productUnit } : {}),
                quantity,
                unit_price: unitPrice,
                labor_cost: laborCost,
                total: computeItemSubtotal({
                    quantity,
                    unit_price: unitPrice,
                    labor_cost: laborCost,
                    price_adjustment_mode: null,
                    price_adjustment_value: 0,
                    observation_extra_value: 0,
                }),
                observation_text: "",
                observation_show_on_print: false,
                labor_show_on_print: false,
                observation_extra_value: 0,
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                assembly_manual_value: 0,
                group_id: groupRecordId,
                group_name: groupName,
                group_instance_id: groupInstanceId,
                order_index: orderIndex,
                created_at: new Date().toISOString(),
            });
            orderIndex += 10;
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

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, addedCount: inserted };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message, addedCount: 0 };
        }
        console.error("Error adding group to section:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Falha ao adicionar grupo", addedCount: 0 };
    }
}

export async function deleteItemAction(itemId: string, budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        await db.update(itemRecordId).merge({ deleted_at: new Date().toISOString() });
        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error deleting item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover item" };
    }
}

export async function updateItemQuantityAction(itemId: string, budgetId: string, quantity: number) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const unitPrice = Number(item.unit_price) || 0;
        const laborCost = Number(item.labor_cost) || 0;
        const priceAdjustmentModeRaw = (item as Record<string, unknown>).price_adjustment_mode;
        const priceAdjustmentMode: PriceAdjustmentMode | null =
            priceAdjustmentModeRaw === "percent" || priceAdjustmentModeRaw === "fixed"
                ? priceAdjustmentModeRaw
                : null;
        const priceAdjustmentValue = Number(
            (item as Record<string, unknown>).price_adjustment_value ?? 0
        );
        const observationExtraValue = Number(
            (item as Record<string, unknown>).observation_extra_value ?? 0
        );
        const newTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: priceAdjustmentMode,
            price_adjustment_value: priceAdjustmentValue,
            observation_extra_value: observationExtraValue,
        });

        await db.update(itemRecordId).merge({ quantity, total: newTotal });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating item:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar item" };
    }
}

export async function updateItemLaborCostAction(itemId: string, budgetId: string, laborCost: number) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const unitPrice = Number(item.unit_price) || 0;
        const quantity = Number(item.quantity) || 1;
        const priceAdjustmentModeRaw = (item as Record<string, unknown>).price_adjustment_mode;
        const priceAdjustmentMode: PriceAdjustmentMode | null =
            priceAdjustmentModeRaw === "percent" || priceAdjustmentModeRaw === "fixed"
                ? priceAdjustmentModeRaw
                : null;
        const priceAdjustmentValue = Number(
            (item as Record<string, unknown>).price_adjustment_value ?? 0
        );
        const observationExtraValue = Number(
            (item as Record<string, unknown>).observation_extra_value ?? 0
        );
        const newTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: priceAdjustmentMode,
            price_adjustment_value: priceAdjustmentValue,
            observation_extra_value: observationExtraValue,
        });

        await db.update(itemRecordId).merge({ labor_cost: laborCost, total: newTotal });
        await recalculateBudgetTotal(budgetId);

        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error updating labor cost:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar mão de obra" };
    }
}

/** Atualiza o grupo de um item na aba Escopo (budget_item com section_id). groupId null = "Sem grupo". */
export async function updateItemGroupInSectionAction(
    itemId: string,
    budgetId: string,
    groupId: string | null,
    groupName?: string
) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemGroupInSectionAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar grupo do item" };
    }
}

export async function reorderSectionItemsAction(orderedItemIds: string[], budgetId: string) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        for (let i = 0; i < orderedItemIds.length; i++) {
            await db.update(requireRecordId("budget_item", orderedItemIds[i])).merge({
                order_index: i * 10,
            });
        }
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error reordering items:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao reordenar itens" };
    }
}

export async function updateItemCommercialSettingsAction(
    itemId: string,
    budgetId: string,
    patch: {
        observation_text?: string;
        observation_show_on_print?: boolean;
        observation_extra_value?: number;
        price_adjustment_mode?: PriceAdjustmentMode | null;
        price_adjustment_value?: number;
        assembly_manual_value?: number;
        labor_show_on_print?: boolean;
    }
) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const itemRecordId = requireRecordId("budget_item", itemId);
        const itemResult = (await db.select(itemRecordId)) as unknown as BudgetItem[];
        const item = Array.isArray(itemResult) ? itemResult[0] : itemResult;
        if (!item) throw new Error("Item not found");

        const quantity = Number(item.quantity) || 1;
        const unitPrice = Number(item.unit_price) || 0;
        const laborCost = Number(item.labor_cost) || 0;

        const nextModeRaw =
            patch.price_adjustment_mode !== undefined
                ? patch.price_adjustment_mode
                : ((item as Record<string, unknown>).price_adjustment_mode as PriceAdjustmentMode | null);
        const nextMode: PriceAdjustmentMode | null =
            nextModeRaw === "percent" || nextModeRaw === "fixed" ? nextModeRaw : null;
        const nextAdjustmentValue =
            patch.price_adjustment_value !== undefined
                ? Number(patch.price_adjustment_value)
                : Number((item as Record<string, unknown>).price_adjustment_value ?? 0);
        const nextObservationExtra =
            patch.observation_extra_value !== undefined
                ? Number(patch.observation_extra_value)
                : Number((item as Record<string, unknown>).observation_extra_value ?? 0);

        const nextTotal = computeItemSubtotal({
            quantity,
            unit_price: unitPrice,
            labor_cost: laborCost,
            price_adjustment_mode: nextMode,
            price_adjustment_value: nextAdjustmentValue,
            observation_extra_value: nextObservationExtra,
        });

        const mergePayload: Record<string, unknown> = {
            total: nextTotal,
            updated_at: new Date().toISOString(),
        };
        if (patch.observation_text !== undefined) mergePayload.observation_text = patch.observation_text;
        if (patch.observation_show_on_print !== undefined) {
            mergePayload.observation_show_on_print = patch.observation_show_on_print;
        }
        if (patch.observation_extra_value !== undefined) {
            mergePayload.observation_extra_value = Number(patch.observation_extra_value);
        }
        if (patch.price_adjustment_mode !== undefined) {
            mergePayload.price_adjustment_mode = patch.price_adjustment_mode ?? null;
        }
        if (patch.price_adjustment_value !== undefined) {
            mergePayload.price_adjustment_value = Number(patch.price_adjustment_value);
        }
        if (patch.assembly_manual_value !== undefined) {
            mergePayload.assembly_manual_value = Number(patch.assembly_manual_value);
        }
        if (patch.labor_show_on_print !== undefined) {
            mergePayload.labor_show_on_print = Boolean(patch.labor_show_on_print);
        }

        await db.update(itemRecordId).merge(mergePayload);
        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateItemCommercialSettingsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar observação/ajuste do item" };
    }
}

/**
 * Zera `price_adjustment_mode` e `price_adjustment_value` em todos os itens do trecho ou
 * de todos os trechos do local, recalculando `total` de cada linha (observação extra mantida).
 */
export async function clearScopeItemPriceAdjustmentsAction(
    budgetId: string,
    scope: { type: "section"; sectionId: string } | { type: "location"; locationId: string }
): Promise<{ success: boolean; error?: string; clearedCount?: number }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        requireRecordId("budget", budgetId);

        let rawRows: Array<Record<string, unknown>> = [];
        if (scope.type === "section") {
            const sectionRecordId = requireRecordId("budget_section", scope.sectionId);
            const result = await db.query<[Array<Record<string, unknown>>]>(
                `SELECT * FROM budget_item WHERE section_id = $sectionId AND deleted_at IS NONE`,
                { sectionId: sectionRecordId }
            );
            rawRows = result?.[0] ?? [];
        } else {
            const locRecordId = requireRecordId("budget_location", scope.locationId);
            const secRes = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM budget_section WHERE location_id = $locId AND deleted_at IS NONE`,
                { locId: locRecordId }
            );
            const secStrings = (secRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
            if (secStrings.length > 0) {
                const secIds = secStrings.map((s) => requireRecordId("budget_section", s));
                const itemRes = await db.query<[Array<Record<string, unknown>>]>(
                    `SELECT * FROM budget_item WHERE section_id INSIDE $secIds AND deleted_at IS NONE`,
                    { secIds }
                );
                rawRows = itemRes?.[0] ?? [];
            }
        }

        const now = new Date().toISOString();
        let clearedCount = 0;

        for (const row of rawRows) {
            const itemId = recordIdToString(row.id);
            if (!itemId) continue;

            const modeRaw = row.price_adjustment_mode;
            const hadMode = modeRaw === "percent" || modeRaw === "fixed";
            const val = Number(row.price_adjustment_value ?? 0);
            if (!hadMode && val === 0) continue;

            const quantity = Number(row.quantity) || 1;
            const unitPrice = Number(row.unit_price) || 0;
            const laborCost = Number(row.labor_cost) || 0;
            const observationExtraValue = Number(row.observation_extra_value ?? 0);

            const newTotal = computeItemSubtotal({
                quantity,
                unit_price: unitPrice,
                labor_cost: laborCost,
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                observation_extra_value: observationExtraValue,
            });

            await db.update(requireRecordId("budget_item", itemId)).merge({
                price_adjustment_mode: null,
                price_adjustment_value: 0,
                total: newTotal,
                updated_at: now,
            });
            clearedCount += 1;
        }

        await recalculateBudgetTotal(budgetId);
        revalidatePath(budgetRevalidatePath(budgetId));
        return { success: true, clearedCount };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("clearScopeItemPriceAdjustmentsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao zerar ajustes de preço dos itens" };
    }
}

/**
 * IDs de `product_group` referenciados por itens do compositor (escopo via seção/local
 * e compositor via bloco). Usado para restringir o painel de grupos no anotador de fotos.
 */
export async function getBudgetUsedProductGroupIdsAction(
    budgetId: string
): Promise<{ success: boolean; data?: string[]; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", budgetId);
        const set = new Set<string>();

        const mergeGroupRows = (rows: Array<{ group_id: unknown }> | undefined) => {
            for (const row of rows ?? []) {
                const gid = canonicalTableRecordId("product_group", row.group_id);
                if (gid) set.add(gid);
            }
        };

        // Escopo: Surreal costuma não casar bem `IN (SELECT …)` com record ids — usamos INSIDE como no compositor.
        const locRes = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_location WHERE budget_id = $bid AND deleted_at IS NONE`,
            { bid: budgetRecordId }
        );
        const locStrings = (locRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
        if (locStrings.length > 0) {
            const locIds = locStrings.map((s) => requireRecordId("budget_location", s));
            const secRes = await db.query<[Array<{ id: unknown }>]>(
                `SELECT id FROM budget_section WHERE location_id INSIDE $locIds AND deleted_at IS NONE`,
                { locIds }
            );
            const secStrings = (secRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
            if (secStrings.length > 0) {
                const secIds = secStrings.map((s) => requireRecordId("budget_section", s));
                const itemRes = await db.query<[Array<{ group_id: unknown }>]>(
                    `SELECT group_id FROM budget_item WHERE section_id INSIDE $secIds AND deleted_at IS NONE AND group_id IS NOT NONE`,
                    { secIds }
                );
                mergeGroupRows(itemRes[0]);
            }
        }

        const blockRes = await db.query<[Array<{ id: unknown }>]>(
            `SELECT id FROM budget_block WHERE budget_id = $bid AND deleted_at IS NONE`,
            { bid: budgetRecordId }
        );
        const blockStrings = (blockRes[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
        if (blockStrings.length > 0) {
            const blockIds = blockStrings.map((s) => requireRecordId("budget_block", s));
            const itemRes = await db.query<[Array<{ group_id: unknown }>]>(
                `SELECT group_id FROM budget_item WHERE block_id INSIDE $blockIds AND deleted_at IS NONE AND group_id IS NOT NONE`,
                { blockIds }
            );
            mergeGroupRows(itemRes[0]);
        }

        return { success: true, data: [...set] };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getBudgetUsedProductGroupIdsAction error:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar grupos do orçamento" };
    }
}
