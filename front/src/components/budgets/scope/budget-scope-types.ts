export type Selection =
    | { type: "location"; id: string }
    | { type: "section"; id: string; locationId: string };

export interface BudgetScopeProps {
    budgetId: string;
    isReadOnly?: boolean;
}
