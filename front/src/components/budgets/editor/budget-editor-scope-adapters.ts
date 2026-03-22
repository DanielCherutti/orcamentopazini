import type { ScopeLocation, ScopeSection } from "@/actions/budget-scope-actions";
import type { BudgetLocation, BudgetSection } from "@/types/budget-types";

/** Converte trecho do modelo de orçamento (árvore) para o formato usado pelo painel de escopo. */
export function budgetSectionToScopeSection(
    sec: BudgetSection,
    budgetId: string,
    locationId: string
): ScopeSection {
    const sid = sec.id as string;
    return {
        id: sid,
        location_id: sec.location_id ?? locationId,
        budget_id: sec.budget_id ?? budgetId,
        name: sec.name,
        description: sec.description,
        order_index: sec.order_index ?? 0,
        created_at: "",
    };
}

/** Converte todos os locais para `ScopeLocation[]` (ex.: prop `locations` do `SectionDetail`). */
export function budgetLocationsToScopeLocations(
    locs: BudgetLocation[],
    budgetId: string
): ScopeLocation[] {
    return locs.map((loc) => {
        const lid = loc.id as string;
        return {
            id: lid,
            budget_id: budgetId,
            name: loc.name,
            description: loc.description,
            order_index: loc.order_index ?? 0,
            created_at: "",
            sections: (loc.sections || []).map((s) => budgetSectionToScopeSection(s, budgetId, lid)),
        };
    });
}
