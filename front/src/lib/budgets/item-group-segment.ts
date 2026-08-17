import type { BudgetItem } from "@/types/budget-types";

const INSTANCE_SEP = ":::";

/**
 * Chave para agrupar itens consecutivos na UI. Cada inserção de grupo do catálogo
 * recebe um `group_instance_id` único, assim o mesmo `product_group` pode aparecer
 * várias vezes com blocos separados (início/fim distintos).
 */
export function getBudgetItemGroupSegmentKey(item: BudgetItem): string | null {
    const rec = item as Record<string, unknown>;
    const gid = rec.group_id as string | undefined;
    const inst = rec.group_instance_id as string | undefined;
    const groupName = String(rec.group_name ?? "").trim();
    // Grupos temporários existem apenas no orçamento: não possuem `product_group`,
    // mas usam uma instância própria e um nome desnormalizado.
    if ((gid == null || gid === "") && inst && groupName) return `temporary${INSTANCE_SEP}${inst}`;
    if (gid == null || gid === "") return null;
    if (inst != null && inst !== "") return `${String(gid)}${INSTANCE_SEP}${inst}`;
    return String(gid);
}

export type ItemSegment =
    | { type: "standalone"; item: BudgetItem }
    | { type: "group"; id: string; name: string; items: BudgetItem[] };

export function buildItemSegments(items: BudgetItem[]): ItemSegment[] {
    const segments: ItemSegment[] = [];
    for (const item of items) {
        const key = getBudgetItemGroupSegmentKey(item);
        if (key == null) {
            segments.push({ type: "standalone", item });
        } else {
            const last = segments[segments.length - 1];
            if (last && last.type === "group" && last.id === key) {
                last.items.push(item);
            } else {
                const rec = item as Record<string, unknown>;
                const gname = (rec.group_name as string) ?? key;
                segments.push({ type: "group", id: key, name: gname, items: [item] });
            }
        }
    }
    return segments;
}

/** Mantém o item movido junto ao grupo de destino (ou após o grupo do qual saiu). */
export function moveItemAfterGroupMembers(
    orderedItemIds: string[],
    itemId: string,
    groupMemberIds: string[]
): string[] {
    const withoutItem = orderedItemIds.filter((id) => id !== itemId);
    const members = new Set(groupMemberIds.filter((id) => id !== itemId));
    let lastMemberIndex = -1;
    for (let index = 0; index < withoutItem.length; index++) {
        if (members.has(withoutItem[index])) lastMemberIndex = index;
    }
    if (lastMemberIndex === -1) {
        const originalIndex = orderedItemIds.indexOf(itemId);
        const safeIndex = Math.min(Math.max(originalIndex, 0), withoutItem.length);
        withoutItem.splice(safeIndex, 0, itemId);
        return withoutItem;
    }
    withoutItem.splice(lastMemberIndex + 1, 0, itemId);
    return withoutItem;
}
