"use client";

import { createContext, useContext } from "react";

export type ActiveTab = 'budget' | 'scope' | 'quote' | 'print' | 'email';

export type WorkspaceContextType = {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
};

export const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function useWorkspaceTab() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceTab must be used within BudgetWorkspace");
  }
  return context;
}
