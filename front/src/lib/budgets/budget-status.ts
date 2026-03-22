/**
 * Regras de status do orçamento (workspace).
 * Somente **em andamento** (`draft`) permite alterar estrutura e conteúdo.
 */
export type BudgetWorkflowStatus =
    | "draft"
    | "finalized"
    | "sent"
    | "approved"
    | "rejected";

/** Orçamento editável (em andamento). */
export function isBudgetEditableStatus(status: string | undefined | null): boolean {
    return status === "draft";
}

/** Rótulos para exibição (pt-BR). */
export function getBudgetStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        draft: "Em andamento",
        finalized: "Finalizado",
        sent: "Enviado",
        approved: "Aprovado",
        rejected: "Recusado",
    };
    return labels[status] ?? status;
}
