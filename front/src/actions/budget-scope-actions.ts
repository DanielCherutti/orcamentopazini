"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import {
  getBudgetImagesByBlocks,
  getBudgetImagesByLocation,
  getBudgetImagesBySection,
} from "@/actions/budget-annotations";
import type { BudgetImage } from "@/types/budget-types";
import {
  buildTree,
  flattenTree,
  type BudgetBlock,
  type BudgetBlockFlat,
} from "@/types/budget-compositor-types";

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
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const budgetRecordId = requireRecordId("budget", budgetId);

    const locResult = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC`,
      { budgetId: budgetRecordId }
    );
    const locations = locResult?.[0] || [];

    const result: ScopeLocation[] = [];
    for (const loc of locations) {
      const locRecordId = requireRecordId("budget_location", String(loc.id));
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
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
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
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const db = await getDb();
  try {
    const budgetRecordId = requireRecordId("budget", budgetId);

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
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("getScopeStatsAction error:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Erro ao carregar estatísticas" };
  }
}

/** Entradas ordenadas para a lista de figuras do documento (imagens do Escopo: locais e trechos). */
export interface ScopeFigureListEntry {
  id: string;
  caption: string;
}

function scopeFigureEntryFromImage(
  img: unknown,
  seen: Set<string>,
  entries: ScopeFigureListEntry[]
): void {
  const row = img as BudgetImage & { caption?: string };
  const id = String(row.id);
  if (seen.has(id)) return;
  seen.add(id);
  entries.push({
    id,
    caption: typeof row.caption === "string" ? row.caption.trim() : "",
  });
}

/** DFS na subárvore do bloco Escopo: ordem do documento (local → trechos aninhados). */
function collectLocationSectionBlockIdsInScopeOrder(scopeRoot: BudgetBlock): string[] {
  const ids: string[] = [];
  const visit = (node: BudgetBlock) => {
    if (node.type === "location" || node.type === "section") {
      ids.push(node.id);
    }
    for (const child of node.children) {
      visit(child);
    }
  };
  visit(scopeRoot);
  return ids;
}

export async function getScopeFiguresListAction(budgetId: string): Promise<{
  success: boolean;
  entries?: ScopeFigureListEntry[];
  error?: string;
}> {
  const auth = await assertActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const locRes = await getLocationsAction(budgetId);
  if (!locRes.success || !locRes.data) {
    return { success: false, error: locRes.error || "Erro ao carregar locais" };
  }

  const entries: ScopeFigureListEntry[] = [];
  const seen = new Set<string>();

  const db = await getDb();
  try {
    const budgetRecordId = requireRecordId("budget", budgetId);
    const blocksRes = await db.query<[BudgetBlockFlat[]]>(
      "SELECT * FROM budget_block WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC",
      { budgetId: budgetRecordId }
    );
    const flat = (blocksRes[0] || []).map((b) => ({
      ...b,
      id: String(b.id),
      budget_id: String(b.budget_id),
      parent_id: b.parent_id ? String(b.parent_id) : null,
    })) as BudgetBlockFlat[];

    const { blocks: roots } = buildTree(flat, {});
    const scopeBlock = flattenTree(roots).find((b) => b.type === "scope");

    if (scopeBlock) {
      const orderedBlockIds = collectLocationSectionBlockIdsInScopeOrder(scopeBlock);
      const byBlock = await getBudgetImagesByBlocks(orderedBlockIds);
      for (const blockId of orderedBlockIds) {
        const imgs = byBlock[blockId] ?? [];
        for (const img of imgs) {
          scopeFigureEntryFromImage(img, seen, entries);
        }
      }
    }
  } catch (error) {
    if (error instanceof InvalidRecordIdError) {
      return { success: false, error: error.message };
    }
    console.error("getScopeFiguresListAction (blocos compositor):", error);
    if (isTokenExpiredError(error)) resetDb();
  }

  const locs = [...locRes.data].sort((a, b) => a.order_index - b.order_index);

  for (const loc of locs) {
    const limgs = await getBudgetImagesByLocation(loc.id);
    const sortedL = [...limgs].sort(
      (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
    );
    for (const img of sortedL) {
      scopeFigureEntryFromImage(img, seen, entries);
    }

    const secs = [...loc.sections].sort((a, b) => a.order_index - b.order_index);
    for (const sec of secs) {
      const simgs = await getBudgetImagesBySection(sec.id);
      const sortedS = [...simgs].sort(
        (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
      );
      for (const img of sortedS) {
        scopeFigureEntryFromImage(img, seen, entries);
      }
    }
  }

  return { success: true, entries: toPlain(entries) };
}
