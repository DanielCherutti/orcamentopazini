"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, isDbConnectionError } from "@/lib/surreal";
import type { Budget } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";

export async function getBudgetAction(
    id: string,
    retryCount = 0
): Promise<{ success: boolean; data?: Budget; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", id);

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

        const result = await db.query<[Budget[]]>(sql, { id: budgetRecordId });
        const data = result[0]?.[0];
        if (!data) return { success: false, error: "Orçamento não encontrado" };

        const serialized = serializeBudgetEntity(data);
        return { success: true, data: serialized };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error fetching budget:", error);

        if (isDbConnectionError(error) && retryCount < 1) {
            console.log("getBudgetAction - erro de conexão, tentando reconectar...");
            resetDb();
            await new Promise((resolve) => setTimeout(resolve, 100));
            return await getBudgetAction(id, retryCount + 1);
        }

        if (isTokenExpiredError(error)) {
            resetDb();
        }
        return { success: false, error: "Erro ao carregar orçamento" };
    }
}

export async function getNextBudgetNumberAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

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
