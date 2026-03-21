"use client";

import type { BudgetsRepository } from "@/lib/budgets/budgets-repository";
import { realBudgetsRepository } from "@/lib/budgets/real-budgets-repository";

export function useBudgetsRepository(): BudgetsRepository {
  return realBudgetsRepository;
}
