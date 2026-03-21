"use client";

import { BudgetLocation } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Copy, Trash2 } from "lucide-react";
import { InlineLocationCreator } from "./inline-creators";
import { cn } from "@/lib/utils";

interface LocationSidebarProps {
  locations: BudgetLocation[];
  selectedLocationId: string | null;
  budgetId: string;
  sectionNumber: number;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onAddSuccess: () => void;
}

/**
 * Sidebar com índice de locais (ambientes).
 * Exibe lista clicável à esquerda; item selecionado destacado.
 */
export function LocationSidebar({
  locations,
  selectedLocationId,
  budgetId,
  sectionNumber,
  onSelect,
  onDelete,
  onDuplicate,
  onAddSuccess,
}: LocationSidebarProps) {
  return (
    <div className="w-64 shrink-0 flex flex-col border-r bg-card">
      <div className="p-3 border-b">
        <h3 className="text-sm font-semibold text-foreground">Ambientes</h3>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <nav className="p-2 space-y-1">
          {locations.map((location, idx) => {
            const locId = location.id as string;
            const isSelected = selectedLocationId === locId;
            const locNumber = `${sectionNumber}.${idx + 1}`;

            return (
              <div
                key={locId}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-2 cursor-pointer transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted text-foreground"
                )}
                onClick={() => onSelect(locId)}
              >
                <span className="shrink-0 text-xs font-mono opacity-60 w-7">{locNumber}</span>
                <span className="flex-1 truncate text-sm font-medium">
                  {location.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Duplicar ambiente"
                  className={cn(
                    "h-6 w-6 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100",
                    isSelected
                      ? "text-primary-foreground hover:bg-primary-foreground/20"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDuplicate(locId);
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Excluir ambiente"
                  className={cn(
                    "h-6 w-6 shrink-0 opacity-0 group-hover:opacity-70 hover:!opacity-100",
                    isSelected
                      ? "text-primary-foreground hover:bg-primary-foreground/20"
                      : "text-muted-foreground hover:text-destructive"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(locId, location.name);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </nav>

        <div className="p-2 border-t">
          <InlineLocationCreator budgetId={budgetId} onSuccess={onAddSuccess} compact />
        </div>
      </div>
    </div>
  );
}
