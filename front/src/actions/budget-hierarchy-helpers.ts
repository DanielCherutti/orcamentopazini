import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { safeStringRecordId } from "@/lib/surreal-record-ids";

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
