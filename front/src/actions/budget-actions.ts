"use server";

// Barrel de actions do módulo de Orçamentos.
// IMPORT/EXPORT explícito para manter compatibilidade com a análise estática do Next.

import { getBudgetAction, getNextBudgetNumberAction } from "./budget-core-read-actions";
import {
  createBudgetAction,
  deleteBudgetAction,
  updateBudgetAction,
  syncDraftPricesAction,
} from "./budget-core-write-actions";
import { duplicateBudgetAction } from "./budget-core-duplicate-actions";
import { getBudgetsAction } from "./budget-listing-actions";
import {
  addItemAction,
  addGroupToSectionAction,
  deleteItemAction,
  updateItemQuantityAction,
  updateItemLaborCostAction,
  updateItemCommercialSettingsAction,
} from "./budget-hierarchy-section-items-actions";
import {
  addLocationAction,
  updateLocationAction,
  addSectionAction,
  updateSectionAction,
  deleteLocationAction,
  deleteSectionAction,
  duplicateSectionAction,
  duplicateLocationAction,
} from "./budget-hierarchy-scope-structure-actions";

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
  updateItemCommercialSettingsAction,
  deleteLocationAction,
  deleteSectionAction,
  duplicateSectionAction,
  duplicateLocationAction,
};

