export type Selection =
    | { type: "location"; id: string }
    | { type: "section"; id: string; locationId: string };

export interface BudgetScopeProps {
    budgetId: string;
    isReadOnly?: boolean;
    /** Vara % (aba Orçamento) — reflete na exibição de valores no escopo. */
    quoteMarkupPercent?: number;
    /** Desconto % (aba Orçamento) — reflete na exibição de valores no escopo. */
    quoteDiscountPercent?: number;
}
