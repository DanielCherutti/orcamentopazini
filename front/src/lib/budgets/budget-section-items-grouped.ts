import { canonicalTableRecordId } from "@/lib/surreal-record-ids";
import type { BudgetItem } from "@/types/budget-types";

/**
 * Chaves do mapa de `getBudgetItemsBySectionIdsLightAction` usam
 * `canonicalTableRecordId("budget_section", section_id)`; o cliente pode enviar só o UUID.
 */
export function budgetItemsFromGroupedBySectionId(
    grouped: Record<string, BudgetItem[]> | undefined,
    sectionId: string,
    options?: { trustSingleBucket?: boolean }
): BudgetItem[] {
    if (!grouped) return [];
    const canon = canonicalTableRecordId("budget_section", sectionId);
    if (Object.prototype.hasOwnProperty.call(grouped, canon)) return grouped[canon] ?? [];
    if (Object.prototype.hasOwnProperty.call(grouped, sectionId))
        return grouped[sectionId] ?? [];
    /* Mesmo trecho com chave em formato ligeiramente diferente do `sec.id` da API. */
    if (canon) {
        for (const key of Object.keys(grouped)) {
            if (canonicalTableRecordId("budget_section", key) === canon) {
                return grouped[key] ?? [];
            }
        }
    }
    /**
     * Só para queries que filtram **um** trecho (`INSIDE [id]`): o mapa tem no máximo esse bucket.
     * Não usar em lotes multi-trecho (sidebar) — ver comentário no histórico.
     */
    if (options?.trustSingleBucket) {
        const keys = Object.keys(grouped);
        if (keys.length === 1) return grouped[keys[0]!] ?? [];
    }
    return [];
}
