import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { safeStringRecordId } from "@/lib/surreal-record-ids";

/**
 * Monta o conteúdo de uma nova linha `budget_item` a partir de uma existente (duplicação).
 * Preserva ordem e blocos de grupo (`order_index`, `group_id`/`group_name` e textos do produto).
 */
export function buildDuplicatedBudgetItemContent(item: Record<string, unknown>): Record<string, unknown> {
    const orderRaw = item.order_index;
    let orderIndex = 0;
    if (typeof orderRaw === "number" && !Number.isNaN(orderRaw)) {
        orderIndex = orderRaw;
    } else if (typeof orderRaw === "string" && !Number.isNaN(Number(orderRaw))) {
        orderIndex = Number(orderRaw);
    }

    const content: Record<string, unknown> = {
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        labor_cost: item.labor_cost ?? 0,
        total: item.total,
        order_index: orderIndex,
        created_at: new Date().toISOString(),
    };

    if (item.group_id != null) content.group_id = item.group_id;
    if (item.group_name != null) content.group_name = item.group_name;
    if (item.product_name != null) content.product_name = item.product_name;
    if (item.product_unit != null) content.product_unit = item.product_unit;
    if (item.notes != null) content.notes = item.notes;

    return content;
}

/** Extrai product_id como string para lookup (suporta RecordId, string, objeto) */
export function extractProductId(pid: unknown): string | null {
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

export async function recalculateBudgetTotal(budgetId: string) {
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
