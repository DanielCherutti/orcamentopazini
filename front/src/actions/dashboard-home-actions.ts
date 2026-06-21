"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { budgetEditUrl } from "@/lib/budgets/budget-path";

const DEFAULT_COMPANY_ID = 0;
const RECENT_BUDGETS_LIMIT = 5;

export type DashboardRecentBudget = {
  id: string;
  code: string | null;
  title: string;
  createdAt: string | null;
  href: string;
};

export type DashboardHomeSummary = {
  counts: {
    products: number;
    productGroups: number;
    budgets: number;
    clients: number;
  };
  recentBudgets: DashboardRecentBudget[];
};

/** Primeiro registro do primeiro statement retornado por db.query. */
function parseCount(statementResult: unknown): number {
  if (!Array.isArray(statementResult) || statementResult.length === 0) return 0;
  const row = statementResult[0];
  if (!row || typeof row !== "object") return 0;
  const n = (row as Record<string, unknown>).count ?? (row as Record<string, unknown>).total;
  return typeof n === "number" && !Number.isNaN(n) ? n : 0;
}

function safeBudgetId(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null && "id" in raw) {
    const id = (raw as { id?: unknown }).id;
    return id != null ? String(id) : String(raw);
  }
  return String(raw);
}

/**
 * Dados agregados para a página Início do dashboard (KPIs + orçamentos recentes).
 */
export async function getDashboardHomeSummaryAction(): Promise<{
  success: boolean;
  data?: DashboardHomeSummary;
  error?: string;
}> {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const tenantId = await requireActiveTenantId();
  const db = await getDb();

  try {
    const [
      productCountRes,
      groupCountRes,
      budgetCountRes,
      clientCountRes,
      recentRes,
    ] = await Promise.all([
      db.query<[{ count: number }]>(
        `SELECT count() FROM product WHERE company_id = $company_id AND tenant_id = $tenantId AND (is_temporary IS NONE OR is_temporary = false) GROUP ALL`,
        { company_id: DEFAULT_COMPANY_ID, tenantId: tenantRecordId(tenantId) }
      ),
      db.query<[{ count: number }]>(
        `SELECT count() FROM product_group WHERE company_id = $company_id AND tenant_id = $tenantId GROUP ALL`,
        { company_id: DEFAULT_COMPANY_ID, tenantId: tenantRecordId(tenantId) }
      ),
      db.query<[{ count: number }]>(
        `SELECT count() FROM budget WHERE tenant_id = $tenantId GROUP ALL`,
        { tenantId: tenantRecordId(tenantId) },
      ),
      db.query<[{ count: number }]>(
        `SELECT count() FROM client WHERE tenant_id = $tenantId GROUP ALL`,
        { tenantId: tenantRecordId(tenantId) },
      ),
      db.query<[Record<string, unknown>[]]>(
        `SELECT id, code, title, created_at FROM budget WHERE tenant_id = $tenantId ORDER BY created_at DESC LIMIT $limit`,
        { tenantId: tenantRecordId(tenantId), limit: RECENT_BUDGETS_LIMIT }
      ),
    ]);

    const products = parseCount(productCountRes[0]);
    const productGroups = parseCount(groupCountRes[0]);
    const budgets = parseCount(budgetCountRes[0]);
    const clients = parseCount(clientCountRes[0]);

    const rawRecent = recentRes[0] ?? [];
    const recentBudgets: DashboardRecentBudget[] = rawRecent.map((row) => {
      const id = safeBudgetId(row.id);
      const code = row.code != null && String(row.code).trim() !== "" ? String(row.code) : null;
      const title = row.title != null && String(row.title).trim() !== "" ? String(row.title) : "Sem título";
      const createdAt =
        row.created_at != null ? String(row.created_at) : null;
      return {
        id,
        code,
        title,
        createdAt,
        href: id ? budgetEditUrl(id) : "/budgets",
      };
    });

    return {
      success: true,
      data: {
        counts: {
          products,
          productGroups,
          budgets,
          clients,
        },
        recentBudgets,
      },
    };
  } catch (error) {
    console.error("getDashboardHomeSummaryAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return {
      success: false,
      error: "Não foi possível carregar o painel. Tente atualizar a página.",
    };
  }
}
