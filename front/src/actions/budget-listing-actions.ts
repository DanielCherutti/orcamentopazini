"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import type { Budget } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";

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
  const start = (page - 1) * limit;
  const search = params?.query || "";
  const sortBy = params?.sortBy || "created_at";
  const sortOrder = params?.sortOrder || "desc";

  try {
    const budgetsResult = await db.query<[Budget[]]>("SELECT * FROM budget FETCH client_id");
    let allBudgets = (budgetsResult[0] || []).map(serializeBudgetEntity);

    const q = search.trim().toLowerCase();
    if (q) {
      const qDigits = q.replace(/\D/g, "");
      allBudgets = allBudgets.filter((b) => {
        const rec = b as Record<string, unknown>;
        const code = String(rec.code ?? "").toLowerCase();
        const title = String(rec.title ?? "").toLowerCase();
        const clientName = String(rec.client_name ?? "").toLowerCase();
        const cnpjRaw = String(rec.client_cnpj ?? "");
        const cnpjLower = cnpjRaw.toLowerCase();
        const cnpjDigits = cnpjRaw.replace(/\D/g, "");
        return (
          code.includes(q) ||
          title.includes(q) ||
          clientName.includes(q) ||
          cnpjLower.includes(q) ||
          (qDigits.length > 0 && cnpjDigits.includes(qDigits))
        );
      });
    }

    const total = allBudgets.length;

    const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    allBudgets.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      if (sortBy === "client_name") {
        const an = String(a.client_name ?? "").toLowerCase();
        const bn = String(b.client_name ?? "").toLowerCase();
        const comparison = collator.compare(an, bn);
        return sortOrder === "asc" ? comparison : -comparison;
      }

      const aValue = a?.[sortBy];
      const bValue = b?.[sortBy];

      if (typeof aValue === "string" && typeof bValue === "string") {
        const comparison = collator.compare(aValue, bValue);
        return sortOrder === "asc" ? comparison : -comparison;
      }
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
      }
      if (aValue instanceof Date && bValue instanceof Date) {
        return sortOrder === "asc"
          ? aValue.getTime() - bValue.getTime()
          : bValue.getTime() - aValue.getTime();
      }
      return 0;
    });

    const data = allBudgets.slice(start, start + limit);

    return {
      success: true,
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    console.error("Error fetching budgets:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao buscar orçamentos" };
  }
}

