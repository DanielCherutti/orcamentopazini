import { canonicalTableRecordId } from "@/lib/surreal-record-ids";
import type { BudgetItem } from "@/types/budget-types";

/**
 * Chaves do mapa de `getBudgetItemsBySectionIdsLightAction` usam
 * `canonicalTableRecordId("budget_section", section_id)`; o cliente pode enviar só o UUID.
 */
export function budgetItemsFromGroupedBySectionId(
    grouped: Record<string, BudgetItem[]> | undefined,
    sectionId: string
): BudgetItem[] {
    if (!grouped) return [];
    const canon = canonicalTableRecordId("budget_section", sectionId);
    if (Object.prototype.hasOwnProperty.call(grouped, canon)) return grouped[canon] ?? [];
    if (Object.prototype.hasOwnProperty.call(grouped, sectionId))
        return grouped[sectionId] ?? [];
    /* Não usar "só há uma chave no mapa" como fallback: num local com vários trechos
       e itens só num deles, o mapa tem uma entrada mas os outros trechos não devem herdar esses itens. */
    return [];
}
