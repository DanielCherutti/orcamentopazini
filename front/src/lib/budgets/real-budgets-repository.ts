"use client";

import type { BudgetsRepository } from "@/lib/budgets/budgets-repository";
import type { Budget } from "@/types/budget-types";
import {
  getBudgetsAction,
  getBudgetAction,
  createBudgetAction,
  updateBudgetAction,
  addLocationAction,
  updateLocationAction,
  addSectionAction,
  updateSectionAction,
  addItemAction,
  updateItemQuantityAction,
  addGroupToSectionAction,
  deleteLocationAction,
  deleteSectionAction,
  deleteItemAction,
  duplicateSectionAction,
  duplicateLocationAction,
  duplicateBudgetAction,
} from "@/actions/budget-actions";
import { deleteBudgetImage as deleteBudgetImageAction } from "@/actions/budget-annotations";

export const realBudgetsRepository: BudgetsRepository = {
  async list(params) {
    return await getBudgetsAction(params);
  },

  async get(id: string) {
    return await getBudgetAction(id);
  },

  async createDraft() {
    // Mantém o comportamento atual: draft com client_id vazio
    return await createBudgetAction("", "");
  },

  async updateBudget(budgetId: string, patch: Partial<Budget>) {
    return await updateBudgetAction(budgetId, patch);
  },

  async addLocation(budgetId: string, name: string) {
    return await addLocationAction(budgetId, name);
  },

  async updateLocation(locationId: string, budgetId: string, patch: { name?: string; description?: string }) {
    return await updateLocationAction(locationId, budgetId, patch);
  },

  async addSection(locationId: string, budgetId: string, name: string) {
    return await addSectionAction(locationId, budgetId, name);
  },

  async updateSection(sectionId: string, budgetId: string, patch: { name?: string; description?: string }) {
    return await updateSectionAction(sectionId, budgetId, patch);
  },

  async addItem(sectionId: string, budgetId: string, productId: string, quantity: number) {
    return await addItemAction(sectionId, budgetId, productId, quantity);
  },

  async updateItemQuantity(itemId: string, budgetId: string, quantity: number) {
    return await updateItemQuantityAction(itemId, budgetId, quantity);
  },

  async addGroupToSection(sectionId: string, budgetId: string, groupId: string, groupName: string, productQuantities: Record<string, number>, selectedProductIds: string[]) {
    return await addGroupToSectionAction(sectionId, budgetId, groupId, groupName, productQuantities, selectedProductIds);
  },

  async deleteLocation(locationId: string, budgetId: string) {
    return await deleteLocationAction(locationId, budgetId);
  },

  async deleteSection(sectionId: string, budgetId: string) {
    return await deleteSectionAction(sectionId, budgetId);
  },

  async deleteItem(itemId: string, budgetId: string) {
    return await deleteItemAction(itemId, budgetId);
  },

  async deleteBudgetImage(imageId: string, budgetId: string) {
    const result = await deleteBudgetImageAction(imageId, budgetId);
    return result.success ? { success: true } : { success: false, error: result.error };
  },

  async duplicateSection(sectionId: string, budgetId: string) {
    return await duplicateSectionAction(sectionId, budgetId);
  },

  async duplicateLocation(locationId: string, budgetId: string) {
    return await duplicateLocationAction(locationId, budgetId);
  },

  async duplicateBudget(budgetId: string, newTitle?: string) {
    return await duplicateBudgetAction(budgetId, newTitle);
  },
};

