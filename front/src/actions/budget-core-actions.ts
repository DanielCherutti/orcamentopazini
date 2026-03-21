"use server";

import { Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { getDb, resetDb, isTokenExpiredError, isDbConnectionError, toPlain } from "@/lib/surreal";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import type { Budget } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { addBlockAction } from "@/actions/budget-compositor-actions";

export async function getBudgetAction(id: string, retryCount = 0): Promise<{ success: boolean; data?: Budget; error?: string }> {
  const db = await getDb();
  try {
    const decodedId = decodeURIComponent(id);
    const formattedId = decodedId.startsWith("budget:") ? decodedId : `budget:${decodedId}`;

    const sql = `
      SELECT *,
      (
        SELECT *,
          (
            SELECT *,
              (SELECT * FROM image_annotation WHERE image_id = $parent.id) as annotations
              FROM budget_image WHERE location_id = $parent.id
              ORDER BY created_at ASC
          ) as images,
          (
            SELECT *,
              (
                SELECT * FROM budget_item WHERE section_id = $parent.id
                  FETCH product_id
              ) as items,
              (
                SELECT *,
                (SELECT * FROM image_annotation WHERE image_id = $parent.id) as annotations
                FROM budget_image WHERE section_id = $parent.id
                ORDER BY created_at ASC
              ) as images
            FROM budget_section 
            WHERE location_id = $parent.id 
            ORDER BY created_at ASC
          ) as sections 
        FROM budget_location 
        WHERE budget_id = $parent.id 
        ORDER BY created_at ASC
      ) as locations 
      FROM $id
      FETCH client_id
    `;

    const result = await db.query<[Budget[]]>(sql, { id: new StringRecordId(formattedId) });
    const data = result[0]?.[0];
    if (!data) return { success: false, error: "Orçamento não encontrado" };

    const serialized = serializeBudgetEntity(data);
    return { success: true, data: serialized };
  } catch (error) {
    console.error("Error fetching budget:", error);

    // Tenta reconectar se for erro de conexão e ainda não tentou
    if (isDbConnectionError(error) && retryCount < 1) {
      console.log("getBudgetAction - erro de conexão, tentando reconectar...");
      resetDb();
      // Pequeno delay para garantir que o resetDb foi processado
      await new Promise(resolve => setTimeout(resolve, 100));
      return await getBudgetAction(id, retryCount + 1);
    }

    if (isTokenExpiredError(error)) {
      resetDb();
    }
    return { success: false, error: "Erro ao carregar orçamento" };
  }
}

export async function getNextBudgetNumberAction() {
  const db = await getDb();
  try {
    const countQuery = await db.query<[{ count: number }[]]>("SELECT count() FROM budget GROUP ALL");
    const totalBudgets = countQuery[0]?.[0]?.count || 0;
    const sequence = totalBudgets + 1;
    const nextNumber = sequence.toString().padStart(5, "0");

    return {
      success: true,
      data: {
        nextNumber,
        formattedCode: `Proposta Comercial - ${nextNumber}`,
      },
    };
  } catch (error) {
    console.error("Error getting next budget number:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao obter próximo número de orçamento" };
  }
}

export async function createBudgetAction(title: string, code: string) {
  const db = await getDb();
  try {
    const numberResult = await getNextBudgetNumberAction();
    if (!numberResult.success || !numberResult.data) {
      return { success: false, error: numberResult.error };
    }

    const budgetData = {
      title: title || numberResult.data.formattedCode,
      code: code || numberResult.data.nextNumber,
      status: "draft" as const,
      total_value: 0,
      client_id: "",
      use_compositor: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await db.create(new Table("budget")).content(budgetData);
    const createdRecord = Array.isArray(result) ? result[0] : result;
    const createdBudget = {
      ...createdRecord,
      id: String(createdRecord.id),
    } as Budget;

    await addBlockAction({ budgetId: createdBudget.id!, parentId: null, type: "scope", label: "ESCOPO" });

    revalidatePath("/budgets");

    return { success: true, data: toPlain(createdBudget) };
  } catch (error) {
    console.error("Error creating budget:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao criar orçamento" };
  }
}

export async function updateBudgetAction(budgetId: string, updates: Partial<Budget>) {
  const db = await getDb();
  try {
    const allowedFields = [
      "client_id",
      "title",
      "description",
      "status",
      "section_number",
      "payment_terms",
      "delivery_time",
      "validity_days",
      "issue_date",
    ];

    // Normaliza budgetId conforme padrão SurrealDB do projeto
    const decodedBudgetId = decodeURIComponent(budgetId);
    const formattedBudgetId = decodedBudgetId.startsWith("budget:") ? decodedBudgetId : `budget:${decodedBudgetId}`;
    const budgetRecordId = new StringRecordId(formattedBudgetId);

    const safeUpdates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    Object.keys(updates).forEach((key) => {
      if (allowedFields.includes(key) && updates[key as keyof Budget] !== undefined) {
        safeUpdates[key] = updates[key as keyof Budget];
      }
    });

    // Normaliza client_id: se vier como objeto (resultado de FETCH), extrai apenas o ID string.
    // Garante que o banco sempre receba um StringRecordId, não um objeto completo.
    if (safeUpdates.client_id !== undefined && safeUpdates.client_id !== null && safeUpdates.client_id !== "") {
      const rawClientId = safeUpdates.client_id;
      if (typeof rawClientId === "object" && rawClientId !== null && "id" in (rawClientId as Record<string, unknown>)) {
        safeUpdates.client_id = new StringRecordId(String((rawClientId as Record<string, unknown>).id));
      } else if (typeof rawClientId === "string" && rawClientId.trim().length > 0) {
        const clientIdStr = rawClientId.startsWith("client:") ? rawClientId : `client:${rawClientId}`;
        safeUpdates.client_id = new StringRecordId(clientIdStr);
      }
    }

    const structuralKeys = Object.keys(safeUpdates).filter((k) => k !== "updated_at" && k !== "status");

    // Guard: bloquear edições estruturais em orçamentos não-draft
    if (structuralKeys.length > 0) {
      const currentRaw = await db.select(budgetRecordId);
      const currentBudget = (Array.isArray(currentRaw) ? currentRaw[0] : currentRaw) as Record<string, unknown>;
      const currentStatus = currentBudget?.status as string;
      if (["sent", "approved", "rejected"].includes(currentStatus)) {
        return { success: false, error: "Orçamento enviado não pode ser editado." };
      }
    }

    await db.update(budgetRecordId).merge(safeUpdates);

    revalidatePath(budgetRevalidatePath(budgetId));
    revalidatePath("/budgets");

    return { success: true };
  } catch (error) {
    console.error("Error updating budget:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao atualizar orçamento" };
  }
}

export async function deleteBudgetAction(budgetId: string) {
  const db = await getDb();
  try {
    await db.delete(new StringRecordId(budgetId));
    revalidatePath("/budgets");
    return { success: true };
  } catch (error) {
    console.error("Error deleting budget:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao excluir orçamento" };
  }
}

export async function syncDraftPricesAction(
  budgetId: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  const db = await getDb();
  try {
    const decodedId = decodeURIComponent(budgetId);
    const formattedId = decodedId.startsWith("budget:") ? decodedId : `budget:${decodedId}`;
    const budgetRecordId = new StringRecordId(formattedId);

    // Busca todos os itens do compositor com dados do produto
    const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
      "SELECT * FROM budget_item WHERE block_id.budget_id = $budgetId FETCH product_id",
      { budgetId: budgetRecordId }
    );
    const items = itemsRes[0] || [];

    let updatedCount = 0;
    for (const item of items) {
      const product = item.product_id as Record<string, unknown> | null;
      if (!product) continue;

      const currentUnitPrice = Number(product.equipmentPrice || 0);
      const currentLaborCost = Number(product.assemblyPrice || 0);
      const storedUnitPrice = Number(item.unit_price || 0);
      const storedLaborCost = Number(item.labor_cost || 0);

      if (currentUnitPrice !== storedUnitPrice || currentLaborCost !== storedLaborCost) {
        const quantity = Number(item.quantity || 1);
        const itemRecordId = new StringRecordId(String(item.id));
        await db.update(itemRecordId).merge({
          unit_price: currentUnitPrice,
          labor_cost: currentLaborCost,
          total: (currentUnitPrice + currentLaborCost) * quantity,
        });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      const totalRes = await db.query<[{ grand_total: number }[]]>(
        "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
        { budgetId: budgetRecordId }
      );
      const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
      await db.update(budgetRecordId).merge({ total_value: grandTotal, updated_at: new Date().toISOString() });
    }

    return { success: true, updatedCount };
  } catch (error) {
    console.error("syncDraftPricesAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, updatedCount: 0, error: "Erro ao sincronizar preços" };
  }
}

async function duplicateCompositorBlocks(
  db: Awaited<ReturnType<typeof getDb>>,
  originalBudgetRecordId: StringRecordId,
  newBudgetRecordId: StringRecordId
) {
  const blocksRes = await db.query<[Array<Record<string, unknown>>]>(
    "SELECT * FROM budget_block WHERE budget_id = $budgetId ORDER BY order_index ASC",
    { budgetId: originalBudgetRecordId }
  );
  const flatBlocks = blocksRes[0] || [];
  if (flatBlocks.length === 0) return;

  // Mapa oldId → novo StringRecordId (para reconstruir parent_id)
  const oldToNew = new Map<string, StringRecordId>();

  // Processa em ordem topológica: raízes primeiro, depois filhos
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
        // created_at e updated_at gerenciados pelo schema (DEFAULT / VALUE time::now())
      });
      const newBlock = Array.isArray(newBlockRaw) ? newBlockRaw[0] : newBlockRaw;
      oldToNew.set(String(block.id), new StringRecordId(String(newBlock.id)));
    }

    pending.splice(0, pending.length, ...remaining);
  }

  // Copia itens vinculados a cada bloco (block_id)
  for (const [origBlockId, newBlockRecordId] of oldToNew.entries()) {
    const origBlockRecordId = new StringRecordId(origBlockId);
    const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
      "SELECT * FROM budget_item WHERE block_id = $blockId",
      { blockId: origBlockRecordId }
    );
    const items = itemsRes[0] || [];
    for (const item of items) {
      await db.create(new Table("budget_item")).content({
        block_id: newBlockRecordId,
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
}

export async function duplicateBudgetAction(budgetId: string, newTitle?: string): Promise<{ success: boolean; newBudgetId?: string; error?: string }> {
  const db = await getDb();
  try {
    const decodedId = decodeURIComponent(budgetId);
    const formattedId = decodedId.startsWith("budget:") ? decodedId : `budget:${decodedId}`;
    const budgetRecordId = new StringRecordId(formattedId);

    // Busca orçamento original via query explícita (garante todos os campos)
    const originalRes = await db.query<[Array<Record<string, unknown>>]>(
      "SELECT * FROM $id",
      { id: budgetRecordId }
    );
    const original = originalRes[0]?.[0];
    if (!original) return { success: false, error: "Orçamento não encontrado" };

    const useCompositor = !!original.use_compositor;

    // Cria novo orçamento sem cliente e com total zerado
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const newBudget = Array.isArray(newBudgetRaw) ? newBudgetRaw[0] : newBudgetRaw;
    const newBudgetId = String(newBudget.id);
    const newBudgetRecordId = new StringRecordId(newBudgetId);

    if (useCompositor) {
      // Copia blocos do compositor e seus itens
      await duplicateCompositorBlocks(db, budgetRecordId, newBudgetRecordId);

      // Recalcula total via itens do compositor
      const totalRes = await db.query<[{ grand_total: number }[]]>(
        "SELECT math::sum(total) as grand_total FROM budget_item WHERE block_id.budget_id = $budgetId GROUP ALL",
        { budgetId: newBudgetRecordId }
      );
      const grandTotal = totalRes[0]?.[0]?.grand_total || 0;
      await db.update(newBudgetRecordId).merge({ total_value: grandTotal });
    } else {
      // Copia estrutura legada: locais → trechos → itens
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
            created_at: new Date().toISOString(),
          });
          const newSec = Array.isArray(newSecRaw) ? newSecRaw[0] : newSecRaw;
          const newSecId = String(newSec.id);
          const origSecRecordId = new StringRecordId(String(sec.id));

          const itemsRes = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM budget_item WHERE section_id = $secId",
            { secId: origSecRecordId }
          );
          const items = itemsRes?.[0] || [];
          for (const item of items) {
            await db.create(new Table("budget_item")).content({
              section_id: new StringRecordId(newSecId),
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
      }

      // Recalcula total via itens legados
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
    console.error("Error duplicating budget:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao duplicar orçamento" };
  }
}
