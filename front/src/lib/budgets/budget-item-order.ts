import type { BudgetItem } from "@/types/budget-types";

/**
 * Replica no PDF a ordem visual persistida pelo Compositor.
 *
 * Itens legados sem `order_index` permanecem na posição relativa recebida do
 * banco. O índice original também desempata valores iguais, mantendo a ordem
 * estável que o usuário já vê no editor.
 */
export function orderBudgetItemsForPdf(items: BudgetItem[]): BudgetItem[] {
    return items
        .map((item, originalIndex) => ({ item, originalIndex }))
        .sort((a, b) => {
            const aOrder = Number(a.item.order_index);
            const bOrder = Number(b.item.order_index);
            const aHasOrder = Number.isFinite(aOrder);
            const bHasOrder = Number.isFinite(bOrder);

            if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder;
            if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
            return a.originalIndex - b.originalIndex;
        })
        .map(({ item }) => item);
}
