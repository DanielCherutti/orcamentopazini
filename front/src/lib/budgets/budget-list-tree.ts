import type { Budget } from "@/types/budget-types";
import { canonicalTableRecordId, recordIdToString } from "@/lib/surreal-record-ids";

export type BudgetListDisplayRow = {
    budget: Budget;
    depth: number;
    isRevision: boolean;
    isLastInBranch: boolean;
};

export function isBudgetRevision(budget: Budget): boolean {
    return Boolean(budget.parent_budget_id);
}

function budgetKey(id: unknown): string {
    if (id == null || id === "") return "";
    return canonicalTableRecordId("budget", id) || recordIdToString(id);
}

/** Resolve o id do orçamento raiz de uma revisão (cadeia de `parent_budget_id`). */
export function resolveFamilyRootId(budget: Budget, budgetsById: Map<string, Budget>): string {
    const explicitRoot = budgetKey(budget.root_budget_id);
    if (explicitRoot && budgetsById.has(explicitRoot) && !budgetsById.get(explicitRoot)?.parent_budget_id) {
        return explicitRoot;
    }

    let cursorKey = budgetKey(budget.parent_budget_id);
    let safety = 16;
    while (cursorKey && safety-- > 0) {
        const node = budgetsById.get(cursorKey);
        if (!node) break;
        if (!node.parent_budget_id) return cursorKey;
        cursorKey = budgetKey(node.parent_budget_id);
    }

    if (explicitRoot) return explicitRoot;

    const code = String(budget.code ?? "").trim();
    if (code) {
        for (const candidate of budgetsById.values()) {
            if (!candidate.parent_budget_id && String(candidate.code ?? "") === code) {
                return budgetKey(candidate.id);
            }
        }
    }

    return "";
}

function compareBudgetsForList(
    a: Budget,
    b: Budget,
    sortBy: string,
    sortOrder: "asc" | "desc",
    collator: Intl.Collator
): number {
    let primary = 0;

    if (sortBy === "client_name") {
        const an = String(a.client_name ?? "").toLowerCase();
        const bn = String(b.client_name ?? "").toLowerCase();
        primary = collator.compare(an, bn);
        primary = sortOrder === "asc" ? primary : -primary;
    } else {
        const aValue = (a as Record<string, unknown>)?.[sortBy];
        const bValue = (b as Record<string, unknown>)?.[sortBy];

        if (typeof aValue === "string" && typeof bValue === "string") {
            primary = collator.compare(aValue, bValue);
            primary = sortOrder === "asc" ? primary : -primary;
        } else if (typeof aValue === "number" && typeof bValue === "number") {
            primary = sortOrder === "asc" ? aValue - bValue : bValue - aValue;
        }
    }

    if (primary !== 0) return primary;

    const codeCmp = collator.compare(String(a.code ?? ""), String(b.code ?? ""));
    if (codeCmp !== 0) return codeCmp;

    return Number(a.revision_number ?? 0) - Number(b.revision_number ?? 0);
}

function sortRevisionsInFamily(list: Budget[]): Budget[] {
    return [...list].sort((a, b) => {
        const revCmp = Number(a.revision_number ?? 0) - Number(b.revision_number ?? 0);
        if (revCmp !== 0) return revCmp;
        return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });
}

/** Orçamento usado para ordenar a família na listagem (sempre a raiz quando existir). */
function familySortAnchor(family: Budget[]): Budget {
    const root = family.find((b) => !b.parent_budget_id);
    return root ?? family[0];
}

/** Agrupa orçamento raiz + revisões (mesma proposta). Revisões ficam sempre abaixo da raiz, por número. */
export function groupBudgetsIntoFamilies(budgets: Budget[]): Budget[][] {
    const budgetsById = new Map<string, Budget>();
    for (const budget of budgets) {
        const key = budgetKey(budget.id);
        if (key) budgetsById.set(key, budget);
    }

    const revisionsByRoot = new Map<string, Budget[]>();
    const roots: Budget[] = [];

    for (const budget of budgets) {
        if (isBudgetRevision(budget)) {
            const rootKey = resolveFamilyRootId(budget, budgetsById);
            if (!rootKey) continue;
            const list = revisionsByRoot.get(rootKey) ?? [];
            list.push(budget);
            revisionsByRoot.set(rootKey, list);
        } else {
            roots.push(budget);
        }
    }

    const families: Budget[][] = [];

    for (const root of roots) {
        const rootId = budgetKey(root.id);
        if (!rootId) continue;
        const revisions = sortRevisionsInFamily(revisionsByRoot.get(rootId) ?? []);
        revisionsByRoot.delete(rootId);
        families.push([root, ...revisions]);
    }

    for (const [rootKey, revisions] of revisionsByRoot.entries()) {
        const root = budgetsById.get(rootKey);
        const sorted = sortRevisionsInFamily(revisions);
        if (root && !root.parent_budget_id) {
            families.push([root, ...sorted]);
        } else {
            console.warn(
                "[budget-list-tree] Revisões sem orçamento raiz na listagem:",
                rootKey,
                sorted.map((r) => budgetKey(r.id))
            );
            for (const rev of sorted) {
                families.push([rev]);
            }
        }
    }

    return families;
}

export function sortBudgetFamilies(
    families: Budget[][],
    sortBy: string,
    sortOrder: "asc" | "desc"
): Budget[][] {
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
    return [...families].sort((fa, fb) =>
        compareBudgetsForList(familySortAnchor(fa), familySortAnchor(fb), sortBy, sortOrder, collator)
    );
}

export function flattenBudgetFamilies(families: Budget[][]): Budget[] {
    return families.flat();
}

export function annotateBudgetListRows(budgets: Budget[]): BudgetListDisplayRow[] {
    return budgets.map((budget, index) => {
        const isRevision = isBudgetRevision(budget);
        if (!isRevision) {
            return { budget, depth: 0, isRevision: false, isLastInBranch: false };
        }

        const next = budgets[index + 1];
        const isLastInBranch = !next || !isBudgetRevision(next);
        return { budget, depth: 1, isRevision: true, isLastInBranch };
    });
}

export function budgetMatchesSearch(
    budget: Budget,
    queryLower: string,
    queryDigits: string
): boolean {
    if (!queryLower) return true;
    const code = String(budget.code ?? "").toLowerCase();
    const title = String(budget.title ?? "").toLowerCase();
    const clientName = String(budget.client_name ?? "").toLowerCase();
    const cnpjRaw = String(budget.client_cnpj ?? "");
    const cnpjLower = cnpjRaw.toLowerCase();
    const cnpjDigits = cnpjRaw.replace(/\D/g, "");
    return (
        code.includes(queryLower) ||
        title.includes(queryLower) ||
        clientName.includes(queryLower) ||
        cnpjLower.includes(queryLower) ||
        (queryDigits.length > 0 && cnpjDigits.includes(queryDigits))
    );
}

export function filterAndPaginateBudgetFamilies(
    budgets: Budget[],
    opts: {
        query?: string;
        sortBy: string;
        sortOrder: "asc" | "desc";
        page: number;
        limit: number;
    }
): { rows: Budget[]; meta: { total: number; page: number; limit: number; totalPages: number } } {
    const q = (opts.query ?? "").trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");

    let families = groupBudgetsIntoFamilies(budgets);

    if (q) {
        families = families.filter((family) =>
            family.some((member) => budgetMatchesSearch(member, q, qDigits))
        );
    }

    families = sortBudgetFamilies(families, opts.sortBy, opts.sortOrder);

    const total = families.length;
    const start = (opts.page - 1) * opts.limit;
    const pageFamilies = families.slice(start, start + opts.limit);
    const rows = flattenBudgetFamilies(pageFamilies);

    return {
        rows,
        meta: {
            total,
            page: opts.page,
            limit: opts.limit,
            totalPages: Math.max(1, Math.ceil(total / opts.limit)),
        },
    };
}
