"use client";

import { useState, useEffect, type MouseEvent } from "react";
import { BudgetLocation } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Trash2, ChevronDown, ChevronRight, Layers, MapPin, Plus } from "lucide-react";
import { InlineLocationCreator } from "./inline-creators";
import { cn } from "@/lib/utils";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { toast } from "@/lib/toast";

interface LocationSidebarProps {
    locations: BudgetLocation[];
    selectedLocationId: string | null;
    selectedSectionId: string | null;
    budgetId: string;
    sectionNumber: number;
    onSelectLocation: (locationId: string) => void;
    onSelectSection: (locationId: string, sectionId: string) => void;
    onDelete: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
    onAddSuccess: () => void;
    onRefresh: () => void;
}

/**
 * Índice de ambientes com trechos expansíveis (mesmo padrão do escopo):
 * clique no pai → painel mostra todos os trechos; clique num trecho → só aquele.
 */
export function LocationSidebar({
    locations,
    selectedLocationId,
    selectedSectionId,
    budgetId,
    sectionNumber,
    onSelectLocation,
    onSelectSection,
    onDelete,
    onDuplicate,
    onAddSuccess,
    onRefresh,
}: LocationSidebarProps) {
    const repo = useBudgetsRepository();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [addingForLocationId, setAddingForLocationId] = useState<string | null>(null);
    const [newSectionName, setNewSectionName] = useState("");

    useEffect(() => {
        if (selectedLocationId) {
            setExpandedIds((prev) => new Set(prev).add(selectedLocationId));
        }
    }, [selectedLocationId]);

    const toggleExpand = (locId: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(locId)) next.delete(locId);
            else next.add(locId);
            return next;
        });
    };

    const handleAddSection = async (locationId: string) => {
        const name = newSectionName
            .trim()
            .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        if (!name) return;
        const res = await repo.addSection(locationId, budgetId, name);
        if (res.success) {
            setNewSectionName("");
            setAddingForLocationId(null);
            await onRefresh();
            toast.success("Trecho adicionado");
        } else {
            toast.error(res.error || "Erro ao adicionar trecho");
        }
    };

    const handleDeleteSection = async (sectionId: string, e: MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Remover este trecho e seus itens?")) return;
        const res = await repo.deleteSection(sectionId, budgetId);
        if (res.success) {
            await onRefresh();
            toast.success("Trecho removido");
        } else {
            toast.error(res.error || "Erro ao remover trecho");
        }
    };

    const handleDuplicateSection = async (sectionId: string, e: MouseEvent) => {
        e.stopPropagation();
        const res = await repo.duplicateSection(sectionId, budgetId);
        if (res.success) {
            await onRefresh();
            toast.success("Trecho duplicado");
        } else {
            toast.error(res.error || "Erro ao duplicar trecho");
        }
    };

    return (
        <div className="w-72 shrink-0 flex flex-col border-r bg-card">
            <div className="p-3 border-b">
                <h3 className="text-sm font-semibold text-foreground">Ambientes</h3>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
                <nav className="p-2 space-y-2">
                    {locations.map((location, idx) => {
                        const locId = location.id as string;
                        const expanded = expandedIds.has(locId);
                        const isLocationOnlySelected =
                            selectedLocationId === locId && selectedSectionId === null;
                        const sections = location.sections || [];
                        /** Índice sempre lista todos os trechos; só o painel isola um trecho. */
                        const hasBodyBelow = expanded;

                        return (
                            <div
                                key={locId}
                                className="rounded-lg border border-border/80 bg-background/60 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]"
                            >
                                <div
                                    className={cn(
                                        "group flex items-center gap-1.5 px-2 py-2 cursor-pointer transition-colors",
                                        hasBodyBelow ? "rounded-t-lg" : "rounded-lg",
                                        isLocationOnlySelected
                                            ? "bg-primary text-primary-foreground"
                                            : "hover:bg-muted/70"
                                    )}
                                    onClick={() => onSelectLocation(locId)}
                                >
                                    <button
                                        type="button"
                                        className={cn(
                                            "shrink-0 rounded p-0.5 transition-colors",
                                            isLocationOnlySelected
                                                ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
                                                : "text-muted-foreground hover:bg-muted"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpand(locId);
                                        }}
                                        title={expanded ? "Recolher trechos" : "Expandir trechos"}
                                    >
                                        {expanded ? (
                                            <ChevronDown className="h-4 w-4" />
                                        ) : (
                                            <ChevronRight className="h-4 w-4" />
                                        )}
                                    </button>
                                    <div
                                        className={cn(
                                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                                            isLocationOnlySelected
                                                ? "bg-primary-foreground/15"
                                                : "bg-primary/10 text-primary"
                                        )}
                                    >
                                        <MapPin className="h-3.5 w-3.5 opacity-90" />
                                    </div>
                                    <span
                                        className={cn(
                                            "shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-medium tabular-nums",
                                            isLocationOnlySelected
                                                ? "bg-primary-foreground/15 text-primary-foreground/90"
                                                : "bg-muted text-muted-foreground"
                                        )}
                                    >
                                        {sectionNumber}.{idx + 1}.
                                    </span>
                                    <span className="flex-1 truncate text-[13px] font-semibold leading-tight">
                                        {location.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAddingForLocationId((v) => (v === locId ? null : locId));
                                            setNewSectionName("");
                                        }}
                                        className={cn(
                                            "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-all",
                                            isLocationOnlySelected
                                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                : "text-muted-foreground hover:text-primary"
                                        )}
                                        title="Adicionar trecho"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDuplicate(locId);
                                        }}
                                        className={cn(
                                            "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                                            isLocationOnlySelected
                                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                        title="Duplicar ambiente"
                                    >
                                        <Copy className="h-3 w-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(locId, location.name);
                                        }}
                                        className={cn(
                                            "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                                            isLocationOnlySelected
                                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                : "text-muted-foreground hover:text-destructive"
                                        )}
                                        title="Excluir ambiente"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>

                                {expanded && sections.length > 0 && (
                                    <div className="border-t border-border/60 bg-muted/20 px-1.5 py-1.5 rounded-b-lg space-y-0.5">
                                        {sections.map((sec, secIdx) => {
                                            const sid = sec.id as string;
                                            const secSelected = selectedSectionId === sid;
                                            const globalIdx = sections.findIndex((s) => s.id === sec.id) + 1;
                                            const secLabel = `${sectionNumber}.${idx + 1}.${globalIdx || secIdx + 1}`;
                                            return (
                                                <div
                                                    key={sid}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => onSelectSection(locId, sid)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter" || e.key === " ") {
                                                            e.preventDefault();
                                                            onSelectSection(locId, sid);
                                                        }
                                                    }}
                                                    className={cn(
                                                        "group/secrow flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12px] cursor-pointer transition-colors",
                                                        secSelected
                                                            ? "bg-primary text-primary-foreground"
                                                            : "hover:bg-background/80"
                                                    )}
                                                >
                                                    <Layers
                                                        className={cn(
                                                            "h-3.5 w-3.5 shrink-0",
                                                            secSelected
                                                                ? "text-primary-foreground/80"
                                                                : "text-muted-foreground"
                                                        )}
                                                    />
                                                    <span
                                                        className={cn(
                                                            "shrink-0 font-mono text-[10px] tabular-nums",
                                                            secSelected
                                                                ? "text-primary-foreground/85"
                                                                : "text-muted-foreground"
                                                        )}
                                                    >
                                                        {secLabel}
                                                    </span>
                                                    <span className="flex-1 truncate font-medium">{sec.name}</span>
                                                    <button
                                                        type="button"
                                                        title="Duplicar trecho"
                                                        className={cn(
                                                            "shrink-0 rounded p-0.5 opacity-0 hover:!opacity-100 group-hover/secrow:opacity-60",
                                                            secSelected
                                                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                                : "text-muted-foreground"
                                                        )}
                                                        onClick={(e) => handleDuplicateSection(sid, e)}
                                                    >
                                                        <Copy className="h-3 w-3" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title="Excluir trecho"
                                                        className={cn(
                                                            "shrink-0 rounded p-0.5 opacity-0 hover:!opacity-100 group-hover/secrow:opacity-60",
                                                            secSelected
                                                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                                                : "text-muted-foreground hover:text-destructive"
                                                        )}
                                                        onClick={(e) => handleDeleteSection(sid, e)}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {expanded && sections.length === 0 && !addingForLocationId && (
                                    <div className="border-t border-border/60 bg-muted/10 px-2 py-2 rounded-b-lg text-[11px] text-muted-foreground text-center">
                                        Nenhum trecho neste ambiente.
                                    </div>
                                )}

                                {addingForLocationId === locId && (
                                    <div className="border-t border-border/60 bg-muted/10 px-2 py-2 space-y-1.5 rounded-b-lg">
                                        <Input
                                            autoFocus
                                            placeholder="Nome do trecho..."
                                            value={newSectionName}
                                            onChange={(e) => setNewSectionName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") void handleAddSection(locId);
                                                if (e.key === "Escape") {
                                                    setAddingForLocationId(null);
                                                    setNewSectionName("");
                                                }
                                            }}
                                            className="h-8 text-xs"
                                        />
                                        <div className="flex gap-1.5">
                                            <Button
                                                size="sm"
                                                className="h-8 flex-1 text-xs"
                                                type="button"
                                                onClick={() => void handleAddSection(locId)}
                                                disabled={!newSectionName.trim()}
                                            >
                                                Adicionar trecho
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 px-2 text-xs"
                                                type="button"
                                                onClick={() => {
                                                    setAddingForLocationId(null);
                                                    setNewSectionName("");
                                                }}
                                            >
                                                ✕
                                            </Button>
                                        </div>
                                    </div>
                                )}
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
