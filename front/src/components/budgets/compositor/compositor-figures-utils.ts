import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";
import { documentPageWeight, flattenDocumentBlocks } from "./compositor-toc-utils";

export interface ScopeFigureEntry {
  id: string;
  caption: string;
}

export interface FigureListRowModel {
  n: number;
  caption: string;
  page: number;
}

/** Página estimada logo após o bloco “lista de figuras” (onde começam as figuras no corpo). */
export function estimatePageAfterFiguresBlock(
  roots: BudgetBlock[],
  items: Record<string, BudgetItem[]>
): number {
  const ordered = flattenDocumentBlocks(roots);
  let cumulative = 1;
  for (const b of ordered) {
    cumulative += documentPageWeight(b, items);
    if (b.type === "figures") break;
  }
  return Math.max(1, Math.floor(cumulative));
}

export function buildFiguresListModel(
  entries: ScopeFigureEntry[],
  roots: BudgetBlock[],
  items: Record<string, BudgetItem[]>
): FigureListRowModel[] {
  const base = estimatePageAfterFiguresBlock(roots, items);
  return entries.map((e, i) => ({
    n: i + 1,
    caption: e.caption.trim() || "(sem descrição)",
    page: Math.max(1, Math.floor(base + i * 0.62)),
  }));
}
