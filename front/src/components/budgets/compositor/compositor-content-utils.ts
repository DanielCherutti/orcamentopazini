import type { BudgetItem } from "@/types/budget-types";
import type { BudgetBlock } from "@/types/budget-compositor-types";

function findBlockInNode(node: BudgetBlock, id: string): BudgetBlock | null {
    if (node.id === id) return node;
    for (const c of node.children) {
        const found = findBlockInNode(c, id);
        if (found) return found;
    }
    return null;
}

/** Localiza um bloco em qualquer profundidade (DFS). */
export function findBlockInTree(roots: BudgetBlock[], id: string): BudgetBlock | null {
    for (const r of roots) {
        const found = findBlockInNode(r, id);
        if (found) return found;
    }
    return null;
}

export const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

export const NO_GROUP_VALUE = "__none__";

export { buildItemSegments, type ItemSegment } from "@/lib/budgets/item-group-segment";

/** Referência estável para listas vazias (evita loop setState no SectionRenderer). */
export const EMPTY_ITEMS: BudgetItem[] = [];

/** Rótulo padrão do painel Compositor (editável; usado no PDF nas páginas de sessão). */
export const DEFAULT_COMPOSITOR_PANEL_LABEL = "Compositor";

export function getCompositorPanelLabel(label: string | null | undefined): string {
    const trimmed = (label ?? "").trim();
    return trimmed || DEFAULT_COMPOSITOR_PANEL_LABEL;
}

/** Rótulo padrão do bloco `scope` ao criar (editável depois). */
export const COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL = "Detalhamento do projeto";

export function getScopeBlockLabel(label: string | null | undefined): string {
    const trimmed = (label ?? "").trim();
    return trimmed || COMPOSITOR_SCOPE_BLOCK_DEFAULT_LABEL;
}
