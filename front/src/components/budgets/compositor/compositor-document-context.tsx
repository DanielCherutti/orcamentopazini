"use client";

import { createContext, useContext } from "react";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { BudgetItem } from "@/types/budget-types";
import type { ScopeFigureEntry } from "./compositor-figures-utils";

export const CompositorDocumentContext = createContext<{
  roots: BudgetBlock[];
  items: Record<string, BudgetItem[]>;
  scopeFigures: ScopeFigureEntry[];
} | null>(null);

export function useCompositorDocument() {
  return useContext(CompositorDocumentContext);
}
