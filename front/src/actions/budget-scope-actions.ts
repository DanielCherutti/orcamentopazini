"use server";

import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { StringRecordId } from "surrealdb";
import { serializeBudgetEntity } from "@/actions/budget-shared";

function toRecordId(table: string, id: string): StringRecordId {
  const decoded = decodeURIComponent(id);
  const full = decoded.startsWith(`${table}:`) ? decoded : `${table}:${decoded}`;
  return new StringRecordId(full);
}

export interface ScopeSection {
  id: string;
  location_id: string;
  budget_id: string;
  name: string;
  description?: string;
  order_index: number;
  created_at: string;
}

export interface ScopeLocation {
  id: string;
  budget_id: string;
  name: string;
  description?: string;
  order_index: number;
  created_at: string;
  sections: ScopeSection[];
}

export async function getLocationsAction(budgetId: string): Promise<{
  success: boolean;
  data?: ScopeLocation[];
  error?: string;
}> {
  const db = await getDb();
  try {
    const budgetRecordId = toRecordId("budget", budgetId);

    const locResult = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC`,
      { budgetId: budgetRecordId }
    );
    const locations = locResult?.[0] || [];

    const result: ScopeLocation[] = [];
    for (const loc of locations) {
      const locRecordId = toRecordId("budget_location", String(loc.id));
      const secResult = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM budget_section WHERE location_id = $locId AND deleted_at IS NONE ORDER BY order_index ASC`,
        { locId: locRecordId }
      );
      const sections = (secResult?.[0] || []).map(
        (s) => serializeBudgetEntity(s)
      ) as unknown as ScopeSection[];

      result.push({
        ...(serializeBudgetEntity(loc) as unknown as ScopeLocation),
        sections,
      });
    }

    return { success: true, data: toPlain(result) };
  } catch (error) {
    console.error("getLocationsAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao carregar locais" };
  }
}

export async function getScopeStatsAction(budgetId: string): Promise<{
  success: boolean;
  data?: { locations: number; sections: number; items: number };
  error?: string;
}> {
  const db = await getDb();
  try {
    const budgetRecordId = toRecordId("budget", budgetId);

    const [locRes, secRes, itemRes] = await Promise.all([
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_location WHERE budget_id = $budgetId GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_section WHERE budget_id = $budgetId GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_item WHERE section_id.budget_id = $budgetId GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
    ]);

    return {
      success: true,
      data: {
        locations: Number(locRes?.[0]?.[0]?.count || 0),
        sections: Number(secRes?.[0]?.[0]?.count || 0),
        items: Number(itemRes?.[0]?.[0]?.count || 0),
      },
    };
  } catch (error) {
    console.error("getScopeStatsAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao carregar estatísticas" };
  }
}
