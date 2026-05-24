"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import type { Budget } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { filterAndPaginateBudgetFamilies } from "@/lib/budgets/budget-list-tree";

export async function getBudgetsAction(params?: {
  page?: number;
  limit?: number;
  query?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}) {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  const page = params?.page || 1;
  const limit = params?.limit || 10;
  const search = params?.query || "";
  const sortBy = params?.sortBy || "created_at";
  const sortOrder = params?.sortOrder || "desc";

  try {
    const budgetsResult = await db.query<[Budget[]]>("SELECT * FROM budget FETCH client_id");
    let allBudgets = (budgetsResult[0] || []).map(serializeBudgetEntity);

    const { rows, meta } = filterAndPaginateBudgetFamilies(allBudgets, {
      query: search,
      sortBy,
      sortOrder,
      page,
      limit,
    });

    return {
      success: true,
      data: rows,
      meta,
    };
  } catch (error) {
    console.error("Error fetching budgets:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao buscar orçamentos" };
  }
}

