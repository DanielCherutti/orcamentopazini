"use server";

import { assertActionSession } from "@/actions/auth-actions";
import { getDb, resetDb, isTokenExpiredError, isDbConnectionError, toPlain } from "@/lib/surreal";
import type { Budget } from "@/types/budget-types";
import { serializeBudgetEntity } from "@/actions/budget-shared";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { getLocationsAction } from "@/actions/budget-scope-actions";
import {
    computeLocationQuoteBreakdown,
    type ScopePricingItem,
} from "@/lib/budgets/scope-pricing";
import { getBudgetItemsBySectionIdsLightAction } from "@/actions/budget-hierarchy-section-items-actions";

export type GetBudgetReadOptions = {
    /** Quando `false`, retorna só o registro `budget` + `FETCH client_id` e `locations: []`. */
    includeHierarchy?: boolean;
    _retryCount?: number;
};

/** Cabeçalho do orçamento + cliente, sem locais/trechos/itens. */
export async function getBudgetShellAction(
    id: string,
    options?: { _retryCount?: number }
): Promise<{ success: boolean; data?: Budget; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const retryCount = options?._retryCount ?? 0;
    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", id);
        const result = await db.query<[Budget[]]>(`SELECT * FROM $id FETCH client_id`, {
            id: budgetRecordId,
        });
        const data = result[0]?.[0];
        if (!data) return { success: false, error: "Orçamento não encontrado" };

        const serialized = serializeBudgetEntity(data) as Budget;
        const out = { ...serialized, locations: [] as Budget["locations"] };
        return { success: true, data: out };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error fetching budget shell:", error);

        if (isDbConnectionError(error) && retryCount < 1) {
            resetDb();
            await new Promise((resolve) => setTimeout(resolve, 100));
            return await getBudgetShellAction(id, { _retryCount: retryCount + 1 });
        }

        if (isTokenExpiredError(error)) {
            resetDb();
        }
        return { success: false, error: "Erro ao carregar orçamento" };
    }
}

const BUDGET_HIERARCHY_SQL_FULL = `
      SELECT *,
      (
        SELECT *,
          (
            SELECT *,
              (
                SELECT * FROM image_annotation
                WHERE image_id = $parent.id AND deleted_at IS NONE
              ) as annotations
              FROM budget_image
              WHERE location_id = $parent.id AND deleted_at IS NONE
              ORDER BY order_index ASC, created_at ASC
          ) as images,
          (
            SELECT *,
              (
                SELECT * FROM budget_item WHERE section_id = $parent.id AND deleted_at IS NONE
                  FETCH product_id
              ) as items,
              (
                SELECT *,
                (
                  SELECT * FROM image_annotation
                  WHERE image_id = $parent.id AND deleted_at IS NONE
                ) as annotations
                FROM budget_image
                WHERE section_id = $parent.id AND deleted_at IS NONE
                ORDER BY order_index ASC, created_at ASC
              ) as images
            FROM budget_section 
            WHERE location_id = $parent.id AND deleted_at IS NONE
            ORDER BY order_index ASC, created_at ASC
          ) as sections 
        FROM budget_location 
        WHERE budget_id = $parent.id AND deleted_at IS NONE
        ORDER BY order_index ASC, created_at ASC
      ) as locations 
      FROM $id
      FETCH client_id
    `;

/** Mesmo grafo que `getBudgetAction`, mas sem `FETCH product_id` nos itens (PDF / cargas pesadas). */
const BUDGET_HIERARCHY_SQL_PDF_SCOPE = `
      SELECT *,
      (
        SELECT *,
          (
            SELECT *,
              (
                SELECT * FROM image_annotation
                WHERE image_id = $parent.id AND deleted_at IS NONE
              ) as annotations
              FROM budget_image
              WHERE location_id = $parent.id AND deleted_at IS NONE
              ORDER BY order_index ASC, created_at ASC
          ) as images,
          (
            SELECT *,
              (
                SELECT * FROM budget_item WHERE section_id = $parent.id AND deleted_at IS NONE
              ) as items,
              (
                SELECT *,
                (
                  SELECT * FROM image_annotation
                  WHERE image_id = $parent.id AND deleted_at IS NONE
                ) as annotations
                FROM budget_image
                WHERE section_id = $parent.id AND deleted_at IS NONE
                ORDER BY order_index ASC, created_at ASC
              ) as images
            FROM budget_section 
            WHERE location_id = $parent.id AND deleted_at IS NONE
            ORDER BY order_index ASC, created_at ASC
          ) as sections 
        FROM budget_location 
        WHERE budget_id = $parent.id AND deleted_at IS NONE
        ORDER BY order_index ASC, created_at ASC
      ) as locations 
      FROM $id
      FETCH client_id
    `;

function mapRawToPricingItem(
    raw: Record<string, unknown>,
    sectionId: string
): ScopePricingItem & { section_id: string } {
    const mode = raw.price_adjustment_mode;
    return {
        id: raw.id != null ? String(raw.id) : undefined,
        section_id: sectionId,
        quantity: Number(raw.quantity ?? 1),
        unit_price: Number(raw.unit_price ?? 0),
        labor_cost: Number(raw.labor_cost ?? 0),
        price_adjustment_mode:
            mode === "percent" || mode === "fixed" ? mode : null,
        price_adjustment_value: Number(raw.price_adjustment_value ?? 0),
        observation_extra_value: Number(raw.observation_extra_value ?? 0),
        assembly_manual_value: Number(raw.assembly_manual_value ?? 0),
    };
}

export type BudgetQuoteTabLocationBreakdown = {
    id: string;
    name: string;
    order_index: number;
    collapsedEquipment: number;
    collapsedAssembly: number;
    sections: Array<{
        id: string;
        name: string;
        order_index: number;
        equipment: number;
        assembly: number;
    }>;
};

/** Uma ida ao servidor: shell do orçamento (campos da aba Orçamento) + totais por local/trecho. */
export async function getBudgetQuoteTabDataAction(budgetId: string): Promise<{
    success: boolean;
    data?: { budget: Budget; quoteLocations: BudgetQuoteTabLocationBreakdown[] };
    error?: string;
}> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const shell = await getBudgetShellAction(budgetId);
    if (!shell.success || !shell.data) {
        return { success: false, error: shell.error ?? "Orçamento não encontrado" };
    }

    const locsRes = await getLocationsAction(budgetId);
    if (!locsRes.success || !locsRes.data) {
        return { success: false, error: locsRes.error ?? "Erro ao carregar locais" };
    }

    const locations = [...locsRes.data].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const sectionIds = locations.flatMap((l) => l.sections.map((s) => s.id));
    const groupedRes = await getBudgetItemsBySectionIdsLightAction(sectionIds);
    const bySection = groupedRes.success && groupedRes.data ? groupedRes.data : {};

    const quoteLocations: BudgetQuoteTabLocationBreakdown[] = [];

    for (const loc of locations) {
        const sections = [...loc.sections].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        const items: Array<ScopePricingItem & { section_id: string }> = [];
        for (const sec of sections) {
            const rows = bySection[sec.id] ?? [];
            for (const it of rows) {
                items.push(mapRawToPricingItem(it as unknown as Record<string, unknown>, sec.id));
            }
        }

        const breakdown = computeLocationQuoteBreakdown({
            location: {
                assembly_mode: loc.assembly_mode,
                assembly_value: loc.assembly_value,
            },
            sections: sections.map((s) => ({
                id: String(s.id),
                assembly_mode: s.assembly_mode,
                assembly_value: s.assembly_value,
            })),
            items,
        });

        quoteLocations.push({
            id: String(loc.id),
            name: String(loc.name),
            order_index: Number(loc.order_index ?? 0),
            collapsedEquipment: breakdown.collapsedEquipment,
            collapsedAssembly: breakdown.collapsedAssembly,
            sections: sections.map((sec) => {
                const sr = breakdown.sectionRows.find((r) => r.sectionId === String(sec.id));
                return {
                    id: String(sec.id),
                    name: String(sec.name),
                    order_index: Number(sec.order_index ?? 0),
                    equipment: sr?.equipment ?? 0,
                    assembly: sr?.assembly ?? 0,
                };
            }),
        });
    }

    return {
        success: true,
        data: toPlain({ budget: shell.data, quoteLocations }),
    };
}

/** PDF: hierarquia completa para `BudgetTable`, sem expandir produtos no grafo. */
export async function getBudgetPdfScopeAction(
    id: string,
    options?: { _retryCount?: number }
): Promise<{ success: boolean; data?: Budget; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const retryCount = options?._retryCount ?? 0;
    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", id);
        const result = await db.query<[Budget[]]>(BUDGET_HIERARCHY_SQL_PDF_SCOPE, {
            id: budgetRecordId,
        });
        const data = result[0]?.[0];
        if (!data) return { success: false, error: "Orçamento não encontrado" };

        const serialized = serializeBudgetEntity(data);
        return { success: true, data: serialized };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("Error fetching budget PDF scope:", error);

        if (isDbConnectionError(error) && retryCount < 1) {
            resetDb();
            await new Promise((resolve) => setTimeout(resolve, 100));
            return await getBudgetPdfScopeAction(id, { _retryCount: retryCount + 1 });
        }

        if (isTokenExpiredError(error)) {
            resetDb();
        }
        return { success: false, error: "Erro ao carregar orçamento" };
    }
}

export async function getBudgetAction(
    id: string,
    options?: GetBudgetReadOptions | number
): Promise<{ success: boolean; data?: Budget; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const normalized =
        typeof options === "number"
            ? { includeHierarchy: true as const, _retryCount: options }
            : {
                  includeHierarchy: options?.includeHierarchy !== false,
                  _retryCount: options?._retryCount ?? 0,
              };
    const { includeHierarchy, _retryCount: retryCount } = normalized;

    if (!includeHierarchy) {
        return getBudgetShellAction(id, { _retryCount: retryCount });
    }

    const db = await getDb();
    try {
        const budgetRecordId = requireRecordId("budget", id);

        const result = await db.query<[Budget[]]>(BUDGET_HIERARCHY_SQL_FULL, { id: budgetRecordId });
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
            return await getBudgetAction(id, { includeHierarchy: true, _retryCount: retryCount + 1 });
        }

        if (isTokenExpiredError(error)) {
            resetDb();
        }
        return { success: false, error: "Erro ao carregar orçamento" };
    }
}

/** Maior sequência numérica já usada em `budget.code` (ex.: "00042" → 42). Ignora códigos não numéricos. */
function maxNumericBudgetCode(rows: Array<{ code: unknown }> | undefined): number {
    let maxSeq = 0;
    for (const row of rows ?? []) {
        const raw = row.code;
        if (raw == null) continue;
        const s = String(raw).trim();
        if (!s) continue;
        const n = Number.parseInt(s, 10);
        if (!Number.isNaN(n) && n >= 0) {
            maxSeq = Math.max(maxSeq, n);
        }
    }
    return maxSeq;
}

export async function getNextBudgetNumberAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const codesRes = await db.query<[Array<{ code: unknown }>]>("SELECT code FROM budget");
        const rows = codesRes[0] ?? [];
        const sequence = maxNumericBudgetCode(rows) + 1;
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
