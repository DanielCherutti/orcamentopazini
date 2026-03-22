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
  isReadOnly?: boolean;
}

export function BudgetTreeV2({ budget, onRefresh, isReadOnly = false }: BudgetTreeV2Props) {
  const locations = useMemo(() => budget.locations || [], [budget.locations]);
  const budgetId = budget.id as string;
  const repo = useBudgetsRepository();

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null
  );
  /** `null` = painel mostra todos os trechos do ambiente; definido = só esse trecho. */
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const pendingSelectLastRef = useRef(false);

  // Ao adicionar novo local, selecionar o último após refresh
  useEffect(() => {
    if (pendingSelectLastRef.current && locations.length > 0) {
      const last = locations[locations.length - 1];
      if (last?.id) {
        setSelectedLocationId(last.id as string);
        setSelectedSectionId(null);
      }
      pendingSelectLastRef.current = false;
    }
  }, [locations]);

  // Auto-selecionar primeiro local quando há locais e nenhum selecionado; limpar se ficar vazio
  useEffect(() => {
    if (locations.length === 0) {
      setSelectedLocationId(null);
      setSelectedSectionId(null);
    } else if (!selectedLocationId) {
      setSelectedLocationId(locations[0].id as string);
    } else {
      const stillExists = locations.some((l) => (l.id as string) === selectedLocationId);
      if (!stillExists) {
        setSelectedLocationId(locations[0].id as string);
        setSelectedSectionId(null);
      }
    }
  }, [locations, selectedLocationId]);

  // Trecho selecionado deixou de existir após refresh
  useEffect(() => {
    if (!selectedSectionId || !selectedLocationId) return;
    const loc = locations.find((l) => (l.id as string) === selectedLocationId);
    const stillThere = loc?.sections?.some((s) => (s.id as string) === selectedSectionId);
    if (!stillThere) setSelectedSectionId(null);
  }, [locations, selectedLocationId, selectedSectionId]);

  const handleDeleteLocation = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir o local "${name}" e todos os seus itens?`))
      return;
    try {
      if (!budgetId) throw new Error("ID do orçamento inválido");
      await repo.deleteLocation(id, budgetId);
      if (selectedLocationId === id) {
        setSelectedSectionId(null);
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

  const n = budget.section_number ?? 1;
  const mobileOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    locations.forEach((loc, idx) => {
      const locId = loc.id as string;
      opts.push({ value: `l:${locId}`, label: `${n}.${idx + 1} — ${loc.name}` });
      (loc.sections || []).forEach((sec, j) => {
        const sid = sec.id as string;
        opts.push({
          value: `s:${locId}:${sid}`,
          label: `${n}.${idx + 1}.${j + 1} — ${sec.name}`,
        });
      });
    });
    return opts;
  }, [locations, n]);

  const mobileSelectValue =
    selectedSectionId && selectedLocationId
      ? `s:${selectedLocationId}:${selectedSectionId}`
      : selectedLocationId
        ? `l:${selectedLocationId}`
        : "";

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0">
      {/* Mobile: dropdown + adicionar local no topo */}
      <div className="md:hidden shrink-0 flex flex-col gap-2 p-2 border-b bg-background">
        {locations.length > 0 && (
          <Select
            value={mobileSelectValue}
            onValueChange={(v) => {
              if (!v) return;
              if (v.startsWith("l:")) {
                setSelectedLocationId(v.slice(2));
                setSelectedSectionId(null);
              } else if (v.startsWith("s:")) {
                const rest = v.slice(2);
                const colon = rest.indexOf(":");
                if (colon === -1) return;
                setSelectedLocationId(rest.slice(0, colon));
                setSelectedSectionId(rest.slice(colon + 1));
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecione ambiente ou trecho" />
            </SelectTrigger>
            <SelectContent className="max-h-[min(70vh,320px)]">
              {mobileOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!isReadOnly && (
          <InlineLocationCreator budgetId={budgetId} onSuccess={handleAddSuccess} compact />
        )}
      </div>

      {/* Desktop: sidebar à esquerda */}
      <div className="hidden md:flex shrink-0">
        <LocationSidebar
          locations={locations}
          selectedLocationId={selectedLocationId}
          selectedSectionId={selectedSectionId}
          budgetId={budgetId}
          sectionNumber={budget.section_number ?? 1}
          onSelectLocation={(locId) => {
            setSelectedLocationId(locId);
            setSelectedSectionId(null);
          }}
          onSelectSection={(locId, sectionId) => {
            setSelectedLocationId(locId);
            setSelectedSectionId(sectionId);
          }}
          onDelete={handleDeleteLocation}
          onDuplicate={handleDuplicateLocation}
          onAddSuccess={handleAddSuccess}
          onRefresh={onRefresh}
          isReadOnly={isReadOnly}
        />
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        <EnvironmentsToggle />
        <LocationDetailPanel
          location={selectedLocation}
          locationIndex={selectedLocation ? locations.findIndex((l) => (l.id as string) === (selectedLocation.id as string)) : -1}
          budgetId={budgetId}
          sectionNumber={budget.section_number ?? 1}
          selectedSectionId={selectedSectionId}
          allLocations={locations}
          onRefresh={onRefresh}
          onDeleteLocation={isReadOnly ? undefined : handleDeleteLocation}
          onDuplicateLocation={isReadOnly ? undefined : handleDuplicateLocation}
          isReadOnly={isReadOnly}
        />
      </div>
    </div>
  );
}
