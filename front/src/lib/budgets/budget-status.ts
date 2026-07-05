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

/** Revisão só a partir de orçamento finalizado ou já encerrado no fluxo. */
export function canCreateBudgetRevision(status: string | undefined | null): boolean {
    return Boolean(status) && status !== "draft";
}

/** Envio e leitura de e-mail da proposta (aba E-mail) — só após finalizar. */
export function canUseBudgetEmail(status: string | undefined | null): boolean {
    return status === "finalized" || status === "sent" || status === "approved";
}

/** Marcar proposta como aprovada pelo cliente (após finalizar ou enviar). */
export function canApproveBudget(status: string | undefined | null): boolean {
    return status === "finalized" || status === "sent";
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
