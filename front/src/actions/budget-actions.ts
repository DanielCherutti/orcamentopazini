"use server";

// Barrel de actions do módulo de Orçamentos.
// IMPORT/EXPORT explícito para manter compatibilidade com a análise estática do Next.

import { getBudgetAction, getNextBudgetNumberAction, createBudgetAction, deleteBudgetAction, updateBudgetAction, duplicateBudgetAction, syncDraftPricesAction } from "./budget-core-actions";
import { getBudgetsAction } from "./budget-listing-actions";
import {
  addLocationAction,
  updateLocationAction,
  addSectionAction,
  updateSectionAction,
  addItemAction,
  addGroupToSectionAction,
  deleteItemAction,
  updateItemQuantityAction,
  updateItemLaborCostAction,
  deleteLocationAction,
  deleteSectionAction,
  duplicateSectionAction,
  duplicateLocationAction,
} from "./budget-hierarchy-actions";

export {
  // Listing
  getBudgetsAction,
  // Core
  getBudgetAction,
  getNextBudgetNumberAction,
  createBudgetAction,
  deleteBudgetAction,
  updateBudgetAction,
  duplicateBudgetAction,
  syncDraftPricesAction,
  // Hierarchy
  addLocationAction,
  updateLocationAction,
  addSectionAction,
  updateSectionAction,
  addItemAction,
  addGroupToSectionAction,
  deleteItemAction,
  updateItemQuantityAction,
  updateItemLaborCostAction,
  deleteLocationAction,
  deleteSectionAction,
  duplicateSectionAction,
  duplicateLocationAction,
};

