import type { ProductGroup } from "@/actions/product-group-actions";
import type { ScopeLocation } from "@/actions/budget-scope-actions";
import type { Selection } from "@/components/budgets/scope/budget-scope-types";

export type BudgetScopeSessionCache = {
    locations: ScopeLocation[];
    scopeNumber: string;
    scopeDataVersion: number;
    selected: Selection | null;
    locationTotalsById: Record<string, number>;
    productGroups?: ProductGroup[];
    /** Estrutura + trechos já preparados nesta sessão do browser. */
    prefetched: boolean;
    cachedAt: number;
};

const store = new Map<string, BudgetScopeSessionCache>();

export function readBudgetScopeSessionCache(budgetId: string): BudgetScopeSessionCache | null {
    const entry = store.get(budgetId);
    if (!entry) return null;
    return {
        ...entry,
        locations: structuredClone(entry.locations),
        locationTotalsById: { ...entry.locationTotalsById },
        productGroups: entry.productGroups ? structuredClone(entry.productGroups) : undefined,
    };
}

export function writeBudgetScopeSessionCache(budgetId: string, data: BudgetScopeSessionCache): void {
    store.set(budgetId, {
        ...data,
        locations: structuredClone(data.locations),
        locationTotalsById: { ...data.locationTotalsById },
        productGroups: data.productGroups ? structuredClone(data.productGroups) : undefined,
        cachedAt: Date.now(),
    });
}

export function invalidateBudgetScopeSessionCache(budgetId: string): void {
    store.delete(budgetId);
}
