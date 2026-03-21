"use server";

import { StringRecordId, Table } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { BudgetBlockFlat } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { getBudgetImagesByBlocks } from "@/actions/budget-annotations";

function toRecordId(table: string, id: string): StringRecordId {
  const decoded = decodeURIComponent(id);
  const full = decoded.startsWith(`${table}:`) ? decoded : `${table}:${decoded}`;
  return new StringRecordId(full);
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function getCompositorTreeAction(budgetId: string): Promise<{
  success: boolean;
  blocks?: BudgetBlockFlat[];
  items?: Record<string, BudgetItem[]>;
  imagesByBlock?: Record<string, unknown[]>;
  error?: string;
}> {
  const db = await getDb();
  try {
    const budgetRecordId = toRecordId("budget", budgetId);

    // Carrega blocos — query principal, nunca pode falhar
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

    // Carrega itens por block_id — query secundária, falha isolada não quebra a árvore
    const itemsByBlock: Record<string, BudgetItem[]> = {};
    if (blocks.length > 0) {
      try {
        const blockIds = blocks.map((b) => new StringRecordId(b.id));
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

    // Carrega imagens de todos os blocos em um único batch
    let imagesByBlock: Record<string, unknown[]> = {};
    if (blocks.length > 0) {
      try {
        imagesByBlock = await getBudgetImagesByBlocks(blocks.map(b => b.id));
      } catch (imagesError) {
        console.warn("getCompositorTreeAction: falha ao carregar imagens (não crítico):", imagesError);
      }
    }

    return { success: true, blocks: toPlain(blocks), items: toPlain(itemsByBlock), imagesByBlock: toPlain(imagesByBlock) };
  } catch (error) {
    console.error("getCompositorTreeAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao carregar compositor" };
  }
}

// ─── Criação de blocos ────────────────────────────────────────────────────────

export async function addBlockAction(params: {
  budgetId: string;
  parentId: string | null;
  type: string;
  label: string;
  props?: Record<string, unknown>;
}): Promise<{ success: boolean; blockId?: string; error?: string }> {
  const db = await getDb();
  try {
    const { budgetId, parentId, type, label, props = {} } = params;
    const budgetRecordId = toRecordId("budget", budgetId);

    // Calcula próximo order_index entre os irmãos
    // Calcula order_index: pega o maior entre os irmãos e incrementa
    let orderIndex = 0;
    try {
      const siblingsRes = await db.query<[Array<{ order_index: number }>]>(
        parentId
          ? "SELECT order_index FROM budget_block WHERE parent_id = $parentId ORDER BY order_index DESC LIMIT 1"
          : "SELECT order_index FROM budget_block WHERE budget_id = $budgetId AND parent_id IS NONE ORDER BY order_index DESC LIMIT 1",
        parentId
          ? { parentId: toRecordId("budget_block", parentId) }
          : { budgetId: budgetRecordId }
      );
      const lastIndex = siblingsRes[0]?.[0]?.order_index ?? -1;
      orderIndex = lastIndex + 1;
    } catch {
      // fallback: usa timestamp como order_index para evitar colisão
      orderIndex = Date.now();
    }

    const raw = await db.create(new Table("budget_block")).content({
      budget_id: budgetRecordId,
      // parent_id omitido (NONE) quando bloco é raiz — null causa erro em option<record<T>>
      ...(parentId ? { parent_id: toRecordId("budget_block", parentId) } : {}),
      type,
      label,
      order_index: orderIndex,
      props,
      // created_at e updated_at gerenciados pelo schema (DEFAULT / VALUE time::now())
    });
    const created = Array.isArray(raw) ? raw[0] : raw;

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true, blockId: String(created.id) };
  } catch (error) {
    console.error("addBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao adicionar bloco" };
  }
}

// ─── Atualização de blocos ────────────────────────────────────────────────────

export async function updateBlockAction(
  blockId: string,
  budgetId: string,
  patch: { label?: string; props?: Record<string, unknown> }
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    const blockRecordId = toRecordId("budget_block", blockId);

    if (patch.props !== undefined) {
      // Merge parcial de props: lê props existentes e mescla
      const current = await db.select(blockRecordId);
      const currentBlock = (Array.isArray(current) ? current[0] : current) as Record<string, unknown>;
      const mergedProps = { ...(currentBlock?.props as Record<string, unknown> ?? {}), ...patch.props };
      await db.update(blockRecordId).merge({
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        props: mergedProps,
        // updated_at gerenciado pelo schema (VALUE time::now())
      });
    } else {
      await db.update(blockRecordId).merge({
        ...(patch.label !== undefined ? { label: patch.label } : {}),
        // updated_at gerenciado pelo schema (VALUE time::now())
      });
    }

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("updateBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao atualizar bloco" };
  }
}

// ─── Exclusão em cascata ──────────────────────────────────────────────────────

async function deleteBlockCascade(db: Awaited<ReturnType<typeof getDb>>, blockId: string) {
  const blockRecordId = toRecordId("budget_block", blockId);

  // Busca filhos diretos
  const childrenRes = await db.query<[Array<{ id: string }>]>(
    "SELECT id FROM budget_block WHERE parent_id = $blockId AND deleted_at IS NONE",
    { blockId: blockRecordId }
  );
  const children = childrenRes[0] || [];

  // Recursão nos filhos antes de deletar o pai
  for (const child of children) {
    await deleteBlockCascade(db, String(child.id));
  }

  // Remove itens vinculados a este bloco (soft delete)
  await db.query(
    "UPDATE budget_item SET deleted_at = $now WHERE block_id = $blockId AND deleted_at IS NONE",
    { blockId: blockRecordId, now: new Date().toISOString() }
  );

  // Soft delete do bloco
  await db.update(blockRecordId).merge({ deleted_at: new Date().toISOString() });
}

export async function deleteBlockAction(
  blockId: string,
  budgetId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    await deleteBlockCascade(db, blockId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("deleteBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao remover bloco" };
  }
}

// ─── Itens em blocos 'section' ────────────────────────────────────────────────

async function recalculateCompositorTotal(db: Awaited<ReturnType<typeof getDb>>, budgetId: string) {
  const budgetRecordId = toRecordId("budget", budgetId);
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
      { blockId: toRecordId("budget_block", blockId) }
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
  const db = await getDb();
  try {
    const productRecordId = toRecordId("product", productId);
    const productResult = await db.select(productRecordId);
    const product = (Array.isArray(productResult) ? productResult[0] : productResult) as Record<string, unknown>;
    if (!product) throw new Error("Produto não encontrado");

    const unitPrice = Number(product.equipmentPrice || 0);
    const laborCost = Number(product.assemblyPrice || 0);
    const orderIndex = await nextOrderIndex(db, blockId);

    await db.create(new Table("budget_item")).content({
      block_id: toRecordId("budget_block", blockId),
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
    return { success: true };
  } catch (error) {
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
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    const { getProductGroupProductsAction } = await import("@/actions/product-group-actions");
    const productsRes = await getProductGroupProductsAction(groupId);
    if (!productsRes.success || !productsRes.data?.length) {
      return { success: false, error: "Este grupo não possui produtos cadastrados." };
    }

    const selectedSet = new Set(selectedProductIds);
    let orderIndex = await nextOrderIndex(db, blockId);
    for (const product of productsRes.data) {
      const productId = typeof product.id === "string" ? product.id : String(product.id);
      if (!selectedSet.has(productId)) continue;

      const unitPrice = Number(product.equipmentPrice || 0);
      const laborCost = Number(product.assemblyPrice || 0);
      const quantity = Math.max(1, productQuantities[productId] ?? 1);

      await db.create(new Table("budget_item")).content({
        block_id: toRecordId("budget_block", blockId),
        product_id: toRecordId("product", productId),
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        total: (unitPrice + laborCost) * quantity,
        group_id: groupId,
        group_name: groupName,
        order_index: orderIndex++,
        created_at: new Date().toISOString(),
      });
    }

    await recalculateCompositorTotal(db, budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("addGroupToBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao adicionar grupo" };
  }
}

export async function deleteItemFromBlockAction(
  itemId: string,
  budgetId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    await db.update(toRecordId("budget_item", itemId)).merge({ deleted_at: new Date().toISOString() });
    await recalculateCompositorTotal(db, budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
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
  const db = await getDb();
  try {
    const itemRecordId = toRecordId("budget_item", itemId);
    const raw = await db.select(itemRecordId);
    const item = (Array.isArray(raw) ? raw[0] : raw) as Record<string, unknown>;
    if (!item) throw new Error("Item não encontrado");

    const unitPrice = Number(item.unit_price) || 0;
    const laborCost = Number(item.labor_cost) || 0;
    await db.update(itemRecordId).merge({ quantity, total: (unitPrice + laborCost) * quantity });

    await recalculateCompositorTotal(db, budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("updateItemQuantityInBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao atualizar quantidade" };
  }
}

/** Atualiza o grupo de um item do compositor. groupId null = "Sem grupo". */
export async function updateItemGroupInBlockAction(
  itemId: string,
  budgetId: string,
  groupId: string | null,
  groupName?: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    const itemRecordId = toRecordId("budget_item", itemId);
    if (groupId === null) {
      await db.query("UPDATE $item SET group_id = NONE, group_name = NONE", { item: itemRecordId });
    } else {
      await db.update(itemRecordId).merge({
        group_id: groupId,
        group_name: groupName ?? "",
      });
    }
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("updateItemGroupInBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao atualizar grupo do item" };
  }
}

export async function reorderItemsInBlockAction(
  blockId: string,
  itemIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    for (let i = 0; i < itemIds.length; i++) {
      await db.update(toRecordId("budget_item", itemIds[i])).merge({ order_index: i });
    }
    return { success: true };
  } catch (error) {
    console.error("reorderItemsInBlockAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao reordenar itens" };
  }
}

export async function moveBlockToParentAction(
  blockId: string,
  newParentId: string | null,
  budgetId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    const blockRecordId = toRecordId("budget_block", blockId);
    if (newParentId) {
      await db.update(blockRecordId).merge({ parent_id: toRecordId("budget_block", newParentId) });
    } else {
      await db.query("UPDATE $block SET parent_id = NONE", { block: blockRecordId });
    }
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    console.error("moveBlockToParentAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao mover bloco" };
  }
}

export async function reorderBlocksAction(
  blockIds: string[],
  budgetId: string
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  try {
    for (let i = 0; i < blockIds.length; i++) {
      await db.update(toRecordId("budget_block", blockIds[i])).merge({ order_index: i });
    }
    const decodedId = decodeURIComponent(budgetId);
    const fmtId = decodedId.startsWith("budget:") ? decodedId : `budget:${decodedId}`;
    revalidatePath(budgetRevalidatePath(fmtId));
    return { success: true };
  } catch (error) {
    console.error("reorderBlocksAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao reordenar blocos" };
  }
}
