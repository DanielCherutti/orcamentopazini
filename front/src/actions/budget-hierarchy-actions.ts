"use server";

import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { BudgetItem } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { getProductGroupProductsAction } from "@/actions/product-group-actions";
import {
    InvalidRecordIdError,
    requireRecordId,
    safeStringRecordId,
} from "@/lib/surreal-record-ids";

/** Extrai product_id como string para lookup (suporta RecordId, string, objeto) */
function extractProductId(pid: unknown): string | null {
  if (!pid) return null;
  if (typeof pid === "string" && pid.length > 0) return pid;
  if (typeof pid === "object" && pid !== null) {
    const o = pid as Record<string, unknown>;
    if (o.id != null) return String(o.id);
    if (typeof (pid as { toString?: () => string }).toString === "function") {
      const s = (pid as { toString: () => string }).toString();
      if (s && !s.startsWith("[object")) return s;
    }
  }
  return null;
}

async function recalculateBudgetTotal(budgetId: string) {
  const db = await getDb();
  try {
    const budgetRecordId = safeStringRecordId("budget", budgetId);
    if (!budgetRecordId) return;

    const result = await db.query<[{ grand_total: number }[]]>(
      `SELECT math::sum(total) as grand_total FROM budget_item WHERE section_id.budget_id = $budgetId GROUP ALL`,
      { budgetId: budgetRecordId }
    );

    const grandTotal = result[0]?.[0]?.grand_total || 0;

    await db.update(budgetRecordId).merge({
      total_value: grandTotal,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error("Failed to recalculate budget total", e);
    if (isTokenExpiredError(e)) resetDb();
  }
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
    let items = (result?.[0] || []).map((item) => {
      const serialized = serializeBudgetEntity(item);
      const productSource = serialized.product_data ?? (typeof serialized.product_id === "object" ? serialized.product_id : null);
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
            typeof a === "object" && a !== null ? serializeBudgetEntity(a as Record<string, unknown>) : a
          );
        }
        serialized.product_data = pd;
      }
      return serialized;
    });

    // Fallback: se product_data não tem description (FETCH falhou), busca cada produto por ID
    const needFetch = items.filter((it) => {
      const pd = (it as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
      const productId = extractProductId((it as Record<string, unknown>).product_id);
      return productId != null && !pd?.description && !pd?.name && !pd?.code;
    });
    if (needFetch.length > 0) {
      const productIds = [...new Set(needFetch.map((it) => extractProductId((it as Record<string, unknown>).product_id)).filter(Boolean))] as string[];
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
        const product = productsMap.get(productId) ?? productsMap.get(productId.replace(/^product:/, ""));
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

    // Garante que product_name (campo desnormalizado) está sempre preenchido
    items = items.map((it) => {
      const r = it as Record<string, unknown>;
      if (r.product_name) return it;
      const pd = r.product_data as Record<string, unknown> | undefined;
      const resolved = String(pd?.description ?? pd?.name ?? pd?.code ?? "");
      if (resolved) r.product_name = resolved;
      return it;
    });

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

export async function updateLocationAction(
  locationId: string,
  budgetId: string,
  patch: { name?: string; description?: string }
) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    await db.update(requireRecordId("budget_location", locationId)).merge({
      ...patch,
      updated_at: new Date().toISOString(),
    });
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error updating location:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar local" };
  }
}

export async function addLocationAction(budgetId: string, name: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const raw = await db.create(new Table("budget_location")).content({
      budget_id: requireRecordId("budget", budgetId),
      name,
      order_index: Date.now(),
      created_at: new Date().toISOString(),
    });
    const created = Array.isArray(raw) ? raw[0] : raw;

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true, data: toPlain(serializeBudgetEntity(created)) };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error adding location:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao adicionar local" };
  }
}

export async function updateSectionAction(
  sectionId: string,
  budgetId: string,
  patch: { name?: string; description?: string }
) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    await db.update(requireRecordId("budget_section", sectionId)).merge({
      ...patch,
      updated_at: new Date().toISOString(),
    });
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error updating section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar trecho" };
  }
}

export async function addSectionAction(locationId: string, budgetId: string, name: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const raw = await db.create(new Table("budget_section")).content({
      location_id: requireRecordId("budget_location", locationId),
      budget_id: requireRecordId("budget", budgetId),
      name,
      order_index: Date.now(),
      created_at: new Date().toISOString(),
    });
    const created = Array.isArray(raw) ? raw[0] : raw;

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true, data: toPlain(serializeBudgetEntity(created)) };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error adding section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao adicionar trecho" };
  }
}

async function upsertBudgetItem(
  db: Awaited<ReturnType<typeof getDb>>,
  sectionId: string,
  productId: string,
  productName: string,
  unitPrice: number,
  laborCost: number,
  quantity: number,
) {
  // Normaliza sectionId para string completa (ex: "budget_section:uuid")
  const sectionIdStr = sectionId.startsWith("budget_section:") ? sectionId : `budget_section:${sectionId}`;

  // type::string(section_id) contorna o problema UUID vs StringRecordId no WHERE.
  // group_id IS NONE filtra apenas itens avulsos (sem grupo associado).
  const existing = await db.query<[Array<{ id: unknown; quantity: number }>]>(
    `SELECT id, quantity FROM budget_item
     WHERE type::string(section_id) = $sectionIdStr
       AND product_name = $productName
       AND group_id IS NONE
       AND deleted_at IS NONE
     LIMIT 1`,
    { sectionIdStr, productName }
  );
  const existingItem = existing[0]?.[0];

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    await db.update(new StringRecordId(String(existingItem.id))).merge({
      quantity: newQty,
      total: (unitPrice + laborCost) * newQty,
    });
  } else {
    await db.create(new Table("budget_item")).content({
      section_id: requireRecordId("budget_section", sectionId),
      product_id: requireRecordId("product", productId),
      product_name: productName,
      quantity,
      unit_price: unitPrice,
      labor_cost: laborCost,
      total: (unitPrice + laborCost) * quantity,
      created_at: new Date().toISOString(),
    });
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

    await upsertBudgetItem(db, sectionId, productId, productName, unitPrice, laborCost, quantity);

    await recalculateBudgetTotal(budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
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
  productQuantities: Record<string, number>, // productId → quantity
  selectedProductIds: string[]              // quais produtos incluir
) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const groupRecordId = safeStringRecordId("product_group", groupId);
  if (!groupRecordId) {
    return { success: false, error: "Identificador inválido" };
  }

  const productsRes = await getProductGroupProductsAction(groupId);
  if (!productsRes.success || !productsRes.data?.length) {
    return { success: false, error: "Este grupo não possui produtos cadastrados." };
  }

  const db = await getDb();
  try {
    const selectedSet = new Set(selectedProductIds);
    for (const product of productsRes.data) {
      const productId = typeof product.id === "string" ? product.id : String(product.id);
      if (!selectedSet.has(productId)) continue;

      const unitPrice = Number(product.equipmentPrice || 0);
      const laborCost = Number(product.assemblyPrice || 0);
      const quantity = Math.max(1, productQuantities[productId] ?? 1);
      const productName = String(product.description || product.code || "");

      await db.create(new Table("budget_item")).content({
        section_id: requireRecordId("budget_section", sectionId),
        product_id: requireRecordId("product", productId),
        product_name: productName,
        quantity,
        unit_price: unitPrice,
        labor_cost: laborCost,
        total: (unitPrice + laborCost) * quantity,
        group_id: groupRecordId,
        group_name: groupName,
        created_at: new Date().toISOString(),
      });
    }

    await recalculateBudgetTotal(budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error adding group to section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao adicionar grupo" };
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
    const newTotal = (unitPrice + laborCost) * quantity;

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
    const newTotal = (unitPrice + laborCost) * quantity;

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
      await db.query("UPDATE $item SET group_id = NONE, group_name = NONE", { item: itemRecordId });
    } else {
      const groupRecordId = requireRecordId("product_group", groupId);
      await db.update(itemRecordId).merge({
        group_id: groupRecordId,
        group_name: groupName ?? "",
      });
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

export async function deleteLocationAction(locationId: string, budgetId: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const locationRecordId = requireRecordId("budget_location", locationId);
    const now = new Date().toISOString();

    // Soft delete de seções e seus itens/imagens
    const sectionsRes = await db.query<[Array<{ id: string }>]>(
      "SELECT id FROM budget_section WHERE location_id = $locationId AND deleted_at IS NONE",
      { locationId: locationRecordId }
    );
    const sections = sectionsRes?.[0] || [];

    for (const sec of sections) {
      const sectionIdRaw = sec.id?.toString?.() ? sec.id.toString() : String(sec.id);
      const sectionRecordId = requireRecordId("budget_section", sectionIdRaw);
      await db.query(
        "UPDATE budget_item SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
        { sectionId: sectionRecordId, now }
      );
      await db.query(
        "UPDATE budget_image SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
        { sectionId: sectionRecordId, now }
      );
      await db.update(sectionRecordId).merge({ deleted_at: now });
    }

    // Soft delete de imagens do local
    await db.query(
      "UPDATE budget_image SET deleted_at = $now WHERE location_id = $locationId AND deleted_at IS NONE",
      { locationId: locationRecordId, now }
    );

    // Soft delete do local
    await db.update(locationRecordId).merge({ deleted_at: now });
    await recalculateBudgetTotal(budgetId);

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error deleting location:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao remover local" };
  }
}

export async function deleteSectionAction(sectionId: string, budgetId: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const sectionRecordId = requireRecordId("budget_section", sectionId);
    const now = new Date().toISOString();
    // Soft delete de itens e imagens do trecho
    await db.query(
      "UPDATE budget_item SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
      { sectionId: sectionRecordId, now }
    );
    await db.query(
      "UPDATE budget_image SET deleted_at = $now WHERE section_id = $sectionId AND deleted_at IS NONE",
      { sectionId: sectionRecordId, now }
    );
    // Soft delete do trecho
    await db.update(sectionRecordId).merge({ deleted_at: now });
    await recalculateBudgetTotal(budgetId);

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error deleting section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao remover trecho" };
  }
}

export async function duplicateSectionAction(sectionId: string, budgetId: string, newName?: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const secRecordId = requireRecordId("budget_section", sectionId);

    // Busca seção original — usando db.select com StringRecordId (WHERE id = string quebra)
    const originalRaw = await db.select(secRecordId);
    const original = (Array.isArray(originalRaw) ? originalRaw[0] : originalRaw) as Record<string, unknown> | undefined;
    if (!original) return { success: false, error: "Trecho não encontrado" };

    const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
      "SELECT * FROM budget_item WHERE section_id = $secId",
      { secId: secRecordId }
    );
    const items = itemsRes?.[0] || [];

    // Cria nova seção com nome customizado ou sufixo padrão
    const newSection = await db.create(new Table("budget_section")).content({
      location_id: original.location_id,
      budget_id: requireRecordId("budget", budgetId),
      name: newName || `${original.name} - Cópia`,
      description: original.description,
      order_index: Date.now(),
      created_at: new Date().toISOString(),
    });
    const created = Array.isArray(newSection) ? newSection[0] : newSection;
    const newSectionId = String(created.id);

    // Duplica itens
    for (const item of items) {
      await db.create(new Table("budget_item")).content({
        section_id: new StringRecordId(newSectionId),
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        labor_cost: item.labor_cost ?? 0,
        total: item.total,
        group_id: item.group_id,
        group_name: item.group_name,
        created_at: new Date().toISOString(),
      });
    }

    await recalculateBudgetTotal(budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true, newSectionId };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error duplicating section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao duplicar trecho" };
  }
}

export async function reorderSectionsAction(orderedSectionIds: string[], budgetId: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    for (let i = 0; i < orderedSectionIds.length; i++) {
      await db.update(requireRecordId("budget_section", orderedSectionIds[i])).merge({ order_index: i * 10 });
    }
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error reordering sections:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao reordenar trechos" };
  }
}

export async function moveSectionAction(sectionId: string, newLocationId: string, budgetId: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    await db.update(requireRecordId("budget_section", sectionId)).merge({
      location_id: requireRecordId("budget_location", newLocationId),
      updated_at: new Date().toISOString(),
    });
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error moving section:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao mover trecho" };
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

export async function duplicateLocationAction(locationId: string, budgetId: string, newName?: string) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const locRecordId = requireRecordId("budget_location", locationId);

    // Busca local original — usando db.select com StringRecordId
    const originalRaw = await db.select(locRecordId);
    const original = (Array.isArray(originalRaw) ? originalRaw[0] : originalRaw) as Record<string, unknown> | undefined;
    if (!original) return { success: false, error: "Local não encontrado" };

    // Cria novo local
    const newLocation = await db.create(new Table("budget_location")).content({
      budget_id: requireRecordId("budget", budgetId),
      name: newName || `${original.name} - Cópia`,
      description: original.description,
      order_index: Date.now(),
      created_at: new Date().toISOString(),
    });
    const createdLoc = Array.isArray(newLocation) ? newLocation[0] : newLocation;
    const newLocationId = String(createdLoc.id);

    // Busca trechos do local original — usando StringRecordId
    const sectionsRes = await db.query<[Array<Record<string, unknown>>]>(
      "SELECT * FROM budget_section WHERE location_id = $locId ORDER BY order_index ASC",
      { locId: locRecordId }
    );
    const sections = sectionsRes?.[0] || [];

    for (const sec of sections) {
      const origSecRecordId = requireRecordId("budget_section", String(sec.id));

      // Cria novo trecho
      const newSection = await db.create(new Table("budget_section")).content({
        location_id: new StringRecordId(newLocationId),
        budget_id: requireRecordId("budget", budgetId),
        name: sec.name,
        description: sec.description,
        order_index: Date.now(),
        created_at: new Date().toISOString(),
      });
      const createdSec = Array.isArray(newSection) ? newSection[0] : newSection;
      const newSectionId = String(createdSec.id);

      // Busca e duplica itens do trecho — usando StringRecordId
      const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM budget_item WHERE section_id = $secId",
        { secId: origSecRecordId }
      );
      const items = itemsRes?.[0] || [];
      for (const item of items) {
        await db.create(new Table("budget_item")).content({
          section_id: new StringRecordId(newSectionId),
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          labor_cost: item.labor_cost ?? 0,
          total: item.total,
          group_id: item.group_id,
          group_name: item.group_name,
          created_at: new Date().toISOString(),
        });
      }
    }

    await recalculateBudgetTotal(budgetId);
    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("Error duplicating location:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao duplicar local" };
  }
}

