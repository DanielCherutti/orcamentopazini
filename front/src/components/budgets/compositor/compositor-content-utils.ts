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

export type ItemSegment =
    | { type: "standalone"; item: BudgetItem }
    | { type: "group"; id: string; name: string; items: BudgetItem[] };

export function buildItemSegments(items: BudgetItem[]): ItemSegment[] {
    const segments: ItemSegment[] = [];
    for (const item of items) {
        const gid = (item as Record<string, unknown>).group_id as string | undefined;
        if (!gid) {
            segments.push({ type: "standalone", item });
        } else {
            const last = segments[segments.length - 1];
            if (last && last.type === "group" && last.id === gid) {
                last.items.push(item);
            } else {
                const gname =
                    (item as Record<string, unknown>).group_name as string ?? gid;
                segments.push({ type: "group", id: gid, name: gname, items: [item] });
            }
        }
    }
    return segments;
}

/** Referência estável para listas vazias (evita loop setState no SectionRenderer). */
export const EMPTY_ITEMS: BudgetItem[] = [];
