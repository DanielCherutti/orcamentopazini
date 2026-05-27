import type { BudgetBlock } from "@/types/budget-compositor-types";
import { getScopeBlockLabel } from "./compositor-content-utils";
import type { BudgetItem } from "@/types/budget-types";

/** Ordem de renderização do documento (DFS, igual a BlockDocument). */
export function flattenDocumentBlocks(nodes: BudgetBlock[]): BudgetBlock[] {
  const out: BudgetBlock[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.children.length > 0) {
      out.push(...flattenDocumentBlocks(n.children));
    }
  }
  return out;
}

/** Peso em “páginas” fracionárias para estimativa de página no documento. */
export function documentPageWeight(block: BudgetBlock, items: Record<string, BudgetItem[]>): number {
  switch (block.type) {
    case "cover":
      return 1;
    case "toc":
      return 1;
    case "figures":
      return 1;
    case "session":
      return 1.75;
    case "location":
      return 1.15;
    case "section": {
      const count = items[block.id]?.length ?? 0;
      return Math.min(3.5, 0.55 + count * 0.06);
    }
    case "text":
      return 0.75;
    case "scope":
      return 2.25;
    case "quote":
      return 1;
    default:
      return 0.45;
  }
}

function chapterTitleForToc(block: BudgetBlock): string {
  if (block.type === "quote") return "ORÇAMENTO";
  if (block.type === "scope") return getScopeBlockLabel(block.label);
  return (block.label || "Sessão").trim() || "Sessão";
}

export interface TocEntryModel {
  number: string;
  title: string;
  depth: number;
  page: number;
}

/** Títulos da antiga página fixa de carta institucional — não entram mais no sumário. */
export function isIntroTocEntry(title: string): boolean {
  const n = title
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    n === "apresentacao" ||
    n === "carta de apresentacao" ||
    n === "carta institucional" ||
    n === "apresentacao institucional"
  );
}

export function filterIntroTocEntries<T extends { title: string }>(entries: T[]): T[] {
  return entries.filter((e) => !isIntroTocEntry(e.title));
}

/**
 * Gera entradas do sumário a partir da árvore atual.
 * Números de página são estimativas; atualizam-se sempre que a árvore ou itens mudam.
 */
export function buildTocModel(
  roots: BudgetBlock[],
  items: Record<string, BudgetItem[]>
): TocEntryModel[] {
  const ordered = flattenDocumentBlocks(roots);
  const entries: TocEntryModel[] = [];
  let cumulative = 1;

  for (const b of ordered) {
    if ((b.type === "session" || b.type === "scope" || b.type === "quote") && b.number) {
      const page = Math.max(1, Math.floor(cumulative));
      entries.push({
        number: b.number,
        title: chapterTitleForToc(b),
        depth: b.depth,
        page,
      });
    }
    cumulative += documentPageWeight(b, items);
  }

  return filterIntroTocEntries(entries);
}
