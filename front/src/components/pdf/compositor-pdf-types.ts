import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";

/** Snapshot para PDF quando o orçamento usa compositor (árvore + lista de figuras). */
export interface CompositorPdfPayload {
  roots: BudgetBlock[];
  items: Record<string, BudgetItem[]>;
  scopeFigures: { id: string; caption: string }[];
}
