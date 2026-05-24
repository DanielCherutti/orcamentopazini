import type { Budget } from "@/types/budget-types";
import { canCreateBudgetRevision, isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import { recordIdToString } from "@/lib/surreal-record-ids";

/** Número de revisão exibido (ex.: 1 → "Rev. 01"). */
export function formatBudgetRevisionLabel(revisionNumber: number): string {
    const n = Math.max(1, Math.trunc(revisionNumber));
    return `Rev. ${String(n).padStart(2, "0")}`;
}

/** Remove sufixo "— Rev. NN" do título antes de gerar o título da próxima revisão. */
export function stripBudgetRevisionTitleSuffix(title: string): string {
    return title.replace(/\s*[—–-]\s*Rev\.\s*\d+$/i, "").trim();
}

export function isBudgetRoot(budget: Budget): boolean {
    return !budget.parent_budget_id;
}

/** Botão "Criar revisão" só no orçamento raiz, sem revisão em rascunho na família. */
export function canShowCreateRevisionButton(budget: Budget, allBudgets: Budget[]): boolean {
    if (!canCreateBudgetRevision(budget.status) || !isBudgetRoot(budget)) {
        return false;
    }

    const familyKey = recordIdToString(budget.id);
    if (!familyKey) return false;

    const family = allBudgets.filter((b) => {
        const key = recordIdToString(b.root_budget_id) || recordIdToString(b.id);
        return key === familyKey;
    });

    return !family.some((b) => isBudgetEditableStatus(b.status));
}

/** Rótulo curto para listagem. */
export function formatBudgetRevisionBadge(revisionNumber: number | undefined | null): string | null {
    if (revisionNumber == null || !Number.isFinite(Number(revisionNumber)) || Number(revisionNumber) < 1) {
        return null;
    }
    return formatBudgetRevisionLabel(Number(revisionNumber));
}
