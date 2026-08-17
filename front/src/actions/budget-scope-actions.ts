"use server";

import { assertWriteActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import {
  InvalidRecordIdError,
  recordIdToString,
  requireRecordId,
} from "@/lib/surreal-record-ids";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
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
  show_costs_on_print?: boolean;
  costs_display_mode?: "location" | "section" | "general";
  price_adjustment_enabled?: boolean;
  price_adjustment_input_mode?: "percent" | "fixed";
  assembly_mode?: "percent" | "fixed" | "manual";
  assembly_value?: number;
  order_index: number;
  created_at: string;
}

export interface ScopeLocation {
  id: string;
  budget_id: string;
  name: string;
  description?: string;
  show_costs_on_print?: boolean;
  costs_display_mode?: "location" | "section" | "general";
  price_adjustment_enabled?: boolean;
  price_adjustment_input_mode?: "percent" | "fixed";
  assembly_mode?: "percent" | "fixed" | "manual";
  assembly_value?: number;
  order_index: number;
  created_at: string;
  sections: ScopeSection[];
}

export async function getLocationsAction(budgetId: string): Promise<{
  success: boolean;
  data?: ScopeLocation[];
  error?: string;
}> {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const gate = await assertBudgetInActiveTenant(budgetId);
  if (!gate.ok) return { success: false, error: gate.error };

  const db = await getDb();
  try {
    const budgetRecordId = gate.budgetRecordId;

    const locResult = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC`,
      { budgetId: budgetRecordId }
    );
    const locations = locResult?.[0] || [];

    /**
     * Um `SELECT … WHERE location_id INSIDE $locIds` pode não retornar linhas em alguns ambientes Surreal.
     * Usamos `location_id = $locId` por local (validado no projeto), em paralelo para não serializar N round-trips.
     */
    const sectionsPerLoc = await Promise.all(
      locations.map(async (loc) => {
        const locRecordId = requireRecordId("budget_location", String(loc.id));
        const secResult = await db.query<[Array<Record<string, unknown>>]>(
          `SELECT * FROM budget_section WHERE location_id = $locId AND deleted_at IS NONE ORDER BY order_index ASC`,
          { locId: locRecordId }
        );
        return (secResult?.[0] || []).map(
          (s) => serializeBudgetEntity(s)
        ) as unknown as ScopeSection[];
      })
    );

    const result: ScopeLocation[] = locations.map((loc, i) => ({
      ...(serializeBudgetEntity(loc) as unknown as ScopeLocation),
      sections: sectionsPerLoc[i] ?? [],
    }));

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
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const gate = await assertBudgetInActiveTenant(budgetId);
  if (!gate.ok) return { success: false, error: gate.error };

  const db = await getDb();
  try {
    const budgetRecordId = gate.budgetRecordId;

    const [locRes, itemResBudget, itemResChain] = await Promise.all([
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
      db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_item WHERE section_id.location_id.budget_id = $budgetId AND deleted_at IS NONE GROUP ALL`,
        { budgetId: budgetRecordId }
      ),
    ]);

    const locRows = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE`,
      { budgetId: budgetRecordId }
    );
    const locStrings = (locRows[0] ?? []).map((r) => recordIdToString(r.id)).filter(Boolean);
    const locIds = locStrings.map((s) => requireRecordId("budget_location", s));
    let sectionCount = 0;
    if (locIds.length > 0) {
      const secRes = await db.query<[Array<{ count: number }>]>(
        `SELECT count() as count FROM budget_section WHERE location_id INSIDE $locIds AND deleted_at IS NONE GROUP ALL`,
        { locIds }
      );
      sectionCount = Number(secRes?.[0]?.[0]?.count || 0);
    }

    const itemsFromBudgetId = Number(itemResBudget?.[0]?.[0]?.count || 0);
    const itemsFromChain = Number(itemResChain?.[0]?.[0]?.count || 0);
    const itemCount = Math.max(itemsFromBudgetId, itemsFromChain);

    return {
      success: true,
      data: {
        locations: Number(locRes?.[0]?.[0]?.count || 0),
        sections: sectionCount,
        items: itemCount,
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

/** Baseline leve: mesmas contagens que `getScopeStatsAction`, com tempo de ida ao Surreal (log em dev). */
export async function getBudgetScopeMetricsAction(budgetId: string): Promise<{
  success: boolean;
  data?: { locations: number; sections: number; items: number; elapsedMs: number };
  error?: string;
}> {
  const t0 = Date.now();
  const inner = await getScopeStatsAction(budgetId);
  const elapsedMs = Date.now() - t0;
  if (!inner.success || !inner.data) {
    return { success: false, error: inner.error };
  }
  if (process.env.NODE_ENV === "development") {
    console.info(
      `[budget-scope-metrics] ${budgetId} loc=${inner.data.locations} sec=${inner.data.sections} items=${inner.data.items} (${elapsedMs}ms)`
    );
  }
  return { success: true, data: { ...inner.data, elapsedMs } };
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
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };

  const locRes = await getLocationsAction(budgetId);
  if (!locRes.success || !locRes.data) {
    return { success: false, error: locRes.error || "Erro ao carregar locais" };
  }

  const entries: ScopeFigureListEntry[] = [];
  const seen = new Set<string>();

  const gate = await assertBudgetInActiveTenant(budgetId);
  if (!gate.ok) return { success: false, error: gate.error };

  const db = await getDb();
  try {
    const budgetRecordId = gate.budgetRecordId;
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
      (a, b) =>
        Number((a as unknown as Record<string, unknown>).order_index ?? 0) -
        Number((b as unknown as Record<string, unknown>).order_index ?? 0)
    );
    for (const img of sortedL) {
      scopeFigureEntryFromImage(img, seen, entries);
    }

    const secs = [...loc.sections].sort((a, b) => a.order_index - b.order_index);
    for (const sec of secs) {
      const simgs = await getBudgetImagesBySection(sec.id);
      const sortedS = [...simgs].sort(
        (a, b) =>
          Number((a as unknown as Record<string, unknown>).order_index ?? 0) -
          Number((b as unknown as Record<string, unknown>).order_index ?? 0)
      );
      for (const img of sortedS) {
        scopeFigureEntryFromImage(img, seen, entries);
      }
    }
  }

  return { success: true, entries: toPlain(entries) };
}
