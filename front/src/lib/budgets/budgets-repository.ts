import type { Budget } from "@/types/budget-types";

export type SortOrder = "asc" | "desc";

export type BudgetListParams = {
  page?: number;
  limit?: number;
  query?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
};

export type BudgetListResult = {
  success: boolean;
  data?: Budget[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
};

export type BudgetGetResult = {
  success: boolean;
  data?: Budget;
  error?: string;
};

export interface BudgetsRepository {
  list(params?: BudgetListParams): Promise<BudgetListResult>;
  get(id: string): Promise<BudgetGetResult>;
  createDraft(clientId: string, title?: string): Promise<{ success: boolean; data?: Budget; error?: string }>;
  updateBudget(budgetId: string, patch: Partial<Budget>): Promise<{ success: boolean; error?: string }>;

  addLocation(budgetId: string, name: string): Promise<{ success: boolean; error?: string }>;
  updateLocation(locationId: string, budgetId: string, patch: { name?: string; description?: string }): Promise<{ success: boolean; error?: string }>;
  addSection(locationId: string, budgetId: string, name: string): Promise<{ success: boolean; error?: string }>;
  updateSection(sectionId: string, budgetId: string, patch: { name?: string; description?: string }): Promise<{ success: boolean; error?: string }>;
  addItem(sectionId: string, budgetId: string, productId: string, quantity: number): Promise<{ success: boolean; error?: string }>;
  updateItemQuantity(itemId: string, budgetId: string, quantity: number): Promise<{ success: boolean; error?: string }>;
  addGroupToSection(sectionId: string, budgetId: string, groupId: string, groupName: string, productQuantities: Record<string, number>, selectedProductIds: string[]): Promise<{ success: boolean; error?: string; addedCount?: number }>;

  deleteLocation(locationId: string, budgetId: string): Promise<{ success: boolean; error?: string }>;
  deleteSection(sectionId: string, budgetId: string): Promise<{ success: boolean; error?: string }>;
  deleteItem(itemId: string, budgetId: string): Promise<{ success: boolean; error?: string }>;
  deleteBudgetImage(imageId: string, budgetId: string): Promise<{ success: boolean; error?: string }>;
  duplicateSection(sectionId: string, budgetId: string): Promise<{ success: boolean; error?: string; newSectionId?: string }>;
  duplicateLocation(locationId: string, budgetId: string): Promise<{ success: boolean; error?: string }>;
  duplicateBudget(budgetId: string, newTitle?: string): Promise<{ success: boolean; newBudgetId?: string; error?: string }>;
  createBudgetRevision(budgetId: string): Promise<{
    success: boolean;
    newBudgetId?: string;
    revisionNumber?: number;
    error?: string;
  }>;
  /** Apenas orçamentos em andamento (`draft`). */
  deleteBudget(budgetId: string): Promise<{ success: boolean; error?: string }>;
}
