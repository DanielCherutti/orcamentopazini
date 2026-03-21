"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Budget, BudgetLocation } from "@/types/budget-types";
import { LocationSidebar } from "./location-sidebar";
import { LocationDetailPanel } from "./location-detail-panel";
import { InlineLocationCreator } from "./inline-creators";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { toast } from "@/lib/toast";
import { EnvironmentsToggle } from "./environments-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BudgetTreeV2Props {
  budget: Budget;
  onRefresh: () => void;
}

export function BudgetTreeV2({ budget, onRefresh }: BudgetTreeV2Props) {
  const locations = useMemo(() => budget.locations || [], [budget.locations]);
  const budgetId = budget.id as string;
  const repo = useBudgetsRepository();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  const pendingSelectLastRef = useRef(false);

  // Ao adicionar novo local, selecionar o último após refresh
  useEffect(() => {
    if (pendingSelectLastRef.current && locations.length > 0) {
      const last = locations[locations.length - 1];
      if (last?.id) setSelectedLocationId(last.id as string);
      pendingSelectLastRef.current = false;
    }
  }, [locations]);

  // Auto-selecionar primeiro local quando há locais e nenhum selecionado; limpar se ficar vazio
  useEffect(() => {
    if (locations.length === 0) {
      setSelectedLocationId(null);
    } else if (!selectedLocationId) {
      setSelectedLocationId(locations[0].id as string);
    } else {
      const stillExists = locations.some((l) => (l.id as string) === selectedLocationId);
      if (!stillExists) setSelectedLocationId(locations[0].id as string);
    }
  }, [locations, selectedLocationId]);

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o local "${name}" e todos os seus itens?`))
      return;
    try {
      if (!budgetId) throw new Error("ID do orçamento inválido");
      await repo.deleteLocation(id, budgetId);
      if (selectedLocationId === id) {
        const idx = locations.findIndex((l) => (l.id as string) === id);
        const prevLocation = idx > 0 ? locations[idx - 1] : null;
        setSelectedLocationId(prevLocation ? (prevLocation.id as string) : null);
      }
      onRefresh();
      toast.success("Local excluído");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao excluir local");
    }
  };

  const handleAddSuccess = async () => {
    await onRefresh();
    pendingSelectLastRef.current = true;
  };

  const handleDuplicateLocation = async (id: string) => {
    const res = await repo.duplicateLocation(id, budgetId);
    if (res.success) {
      await onRefresh();
      pendingSelectLastRef.current = true; // navega ao novo local após refresh
      toast.success("Ambiente duplicado");
    } else {
      toast.error(res.error || "Erro ao duplicar ambiente");
    }
  };

  const selectedLocation: BudgetLocation | null =
    selectedLocationId && locations.length > 0
      ? locations.find((l) => (l.id as string) === selectedLocationId) ?? null
      : null;

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* Mobile: dropdown + adicionar local no topo */}
      <div className="md:hidden shrink-0 flex flex-col gap-2 p-2 border-b bg-background">
        {locations.length > 0 && (
          <Select
            value={selectedLocationId ?? ""}
            onValueChange={(v) => setSelectedLocationId(v || null)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione um ambiente" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((loc, idx) => {
                const n = budget.section_number ?? 1;
                return (
                  <SelectItem key={loc.id} value={loc.id as string}>
                    {n}.{idx + 1} — {loc.name}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
        <InlineLocationCreator budgetId={budgetId} onSuccess={handleAddSuccess} compact />
      </div>

      {/* Desktop: sidebar à esquerda */}
      <div className="hidden md:flex shrink-0">
        <LocationSidebar
          locations={locations}
          selectedLocationId={selectedLocationId}
          budgetId={budgetId}
          sectionNumber={budget.section_number ?? 1}
          onSelect={setSelectedLocationId}
          onDelete={handleDeleteLocation}
          onDuplicate={handleDuplicateLocation}
          onAddSuccess={handleAddSuccess}
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <EnvironmentsToggle />
        <LocationDetailPanel
          location={selectedLocation}
          locationIndex={selectedLocation ? locations.findIndex((l) => (l.id as string) === (selectedLocation.id as string)) : -1}
          budgetId={budgetId}
          sectionNumber={budget.section_number ?? 1}
          onRefresh={onRefresh}
          onDeleteLocation={handleDeleteLocation}
          onDuplicateLocation={handleDuplicateLocation}
        />
      </div>
    </div>
  );
}
