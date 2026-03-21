"use client";

import { useState, useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import {
    Plus,
    Trash2,
    Copy,
    ChevronRight,
    ChevronDown,
    Map,
    Layers,
    GripVertical,
} from "lucide-react";
import {
    DndContext,
    closestCenter,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import type { ScopeLocation, ScopeSection } from "@/actions/budget-scope-actions";
import {
    addLocationAction,
    deleteLocationAction,
    addSectionAction,
    deleteSectionAction,
    duplicateSectionAction,
    duplicateLocationAction,
    reorderSectionsAction,
    moveSectionAction,
} from "@/actions/budget-hierarchy-actions";
import type { Selection } from "./budget-scope-types";

interface ScopeSidebarProps {
    budgetId: string;
    locations: ScopeLocation[];
    selected: Selection | null;
    onSelect: (sel: Selection) => void;
    onRefresh: () => void;
    isReadOnly: boolean;
    scopeNumber: string;
}

export function ScopeSidebar({
    budgetId,
    locations,
    selected,
    onSelect,
    onRefresh,
    isReadOnly,
    scopeNumber,
}: ScopeSidebarProps) {
    const [localLocations, setLocalLocations] = useState(locations);
    const locationsRef = useRef(locations);
    useEffect(() => {
        locationsRef.current = locations;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com `locations` após refresh do pai
        setLocalLocations(locations);
    }, [locations]);

    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const handleSectionDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeSectionId = active.id as string;
        const overId = over.id as string;
        const orig = locationsRef.current;

        const srcLoc = orig.find((l) => l.sections.some((s) => s.id === activeSectionId));
        if (!srcLoc) return;

        const tgtLoc =
            orig.find((l) => l.id === overId) ??
            orig.find((l) => l.sections.some((s) => s.id === overId));
        if (!tgtLoc) return;

        if (srcLoc.id === tgtLoc.id) {
            const sections = srcLoc.sections;
            const oldIdx = sections.findIndex((s) => s.id === activeSectionId);
            const newIdx = sections.findIndex((s) => s.id === overId);
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
            const reordered = arrayMove(sections, oldIdx, newIdx);
            setLocalLocations((locs) =>
                locs.map((l) => (l.id === srcLoc.id ? { ...l, sections: reordered } : l))
            );
            const result = await reorderSectionsAction(reordered.map((s) => s.id), budgetId);
            if (!result.success) {
                setLocalLocations(orig);
                toast.error("Erro ao reordenar trechos");
            }
        } else {
            const section = srcLoc.sections.find((s) => s.id === activeSectionId)!;
            setLocalLocations((locs) =>
                locs.map((l) => {
                    if (l.id === srcLoc.id)
                        return { ...l, sections: l.sections.filter((s) => s.id !== activeSectionId) };
                    if (l.id === tgtLoc.id) return { ...l, sections: [...l.sections, section] };
                    return l;
                })
            );
            const result = await moveSectionAction(activeSectionId, tgtLoc.id, budgetId);
            if (!result.success) {
                setLocalLocations(orig);
                toast.error(result.error || "Erro ao mover trecho");
            } else onRefresh();
        }
    };

    const [addingLocation, setAddingLocation] = useState(false);
    const [newLocationName, setNewLocationName] = useState("");
    const [expandedLocations, setExpandedLocations] = useState<Set<string>>(
        () => new Set(locations.map((l) => l.id))
    );

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- expande novos locais ao chegarem da API
        setExpandedLocations((prev) => {
            const next = new Set(prev);
            locations.forEach((l) => next.add(l.id));
            return next;
        });
    }, [locations]);

    const toggleExpanded = (locationId: string) => {
        setExpandedLocations((prev) => {
            const next = new Set(prev);
            if (next.has(locationId)) next.delete(locationId);
            else next.add(locationId);
            return next;
        });
    };

    const handleAddLocation = async () => {
        const name = newLocationName.trim().toUpperCase();
        if (!name) return;
        const result = await addLocationAction(budgetId, name);
        if (result.success) {
            setNewLocationName("");
            setAddingLocation(false);
            await onRefresh();
        } else {
            toast.error(result.error || "Erro ao adicionar local");
        }
    };

    const [dupLocDialog, setDupLocDialog] = useState<{ locationId: string; defaultName: string } | null>(
        null
    );
    const [dupLocName, setDupLocName] = useState("");
    const [dupLocating, setDupLocating] = useState(false);

    const handleDeleteLocation = async (locationId: string, e: MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Remover este local e todos os seus trechos?")) return;
        const result = await deleteLocationAction(locationId, budgetId);
        if (result.success) {
            await onRefresh();
        } else {
            toast.error(result.error || "Erro ao remover local");
        }
    };

    const openDupLocDialog = (locationId: string, locationName: string, e: MouseEvent) => {
        e.stopPropagation();
        const defaultName = `${locationName} - Cópia`;
        setDupLocName(defaultName);
        setDupLocDialog({ locationId, defaultName });
    };

    const handleDupLocConfirm = async () => {
        if (!dupLocDialog || dupLocating) return;
        setDupLocating(true);
        const result = await duplicateLocationAction(
            dupLocDialog.locationId,
            budgetId,
            dupLocName.trim() || dupLocDialog.defaultName
        );
        setDupLocating(false);
        setDupLocDialog(null);
        if (result.success) await onRefresh();
        else toast.error(result.error || "Erro ao duplicar local");
    };

    return (
        <div className="w-72 shrink-0 flex flex-col border-r bg-card">
            <div className="p-3 border-b border-primary/20 shrink-0 bg-primary/[0.04]">
                <h3 className="text-sm font-semibold text-primary">Escopo</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Locais e trechos</p>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
                <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleSectionDragEnd}
                >
                    <nav className="p-1.5 space-y-0.5">
                        {localLocations.length === 0 && !addingLocation && (
                            <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                                Nenhum local. Adicione um para começar.
                            </p>
                        )}
                        {localLocations.map((loc, locIdx) => (
                            <LocationNode
                                key={loc.id}
                                location={loc}
                                locIndex={locIdx + 1}
                                scopeNumber={scopeNumber}
                                budgetId={budgetId}
                                selected={selected}
                                expanded={expandedLocations.has(loc.id)}
                                onToggleExpand={() => toggleExpanded(loc.id)}
                                onSelect={onSelect}
                                onRefresh={onRefresh}
                                onDelete={(e) => handleDeleteLocation(loc.id, e)}
                                onDuplicate={(e) => openDupLocDialog(loc.id, loc.name, e)}
                                isReadOnly={isReadOnly}
                            />
                        ))}
                    </nav>
                </DndContext>
            </div>

            {!isReadOnly && (
                <div className="p-2 border-t shrink-0">
                    {addingLocation ? (
                        <div className="space-y-1.5">
                            <Input
                                autoFocus
                                placeholder="Nome do local..."
                                value={newLocationName}
                                onChange={(e) => setNewLocationName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAddLocation();
                                    if (e.key === "Escape") {
                                        setAddingLocation(false);
                                        setNewLocationName("");
                                    }
                                }}
                                className="h-7 text-xs"
                            />
                            <div className="flex gap-1">
                                <Button
                                    size="sm"
                                    className="h-7 flex-1 text-xs"
                                    type="button"
                                    onClick={handleAddLocation}
                                    disabled={!newLocationName.trim()}
                                >
                                    Adicionar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    type="button"
                                    onClick={() => {
                                        setAddingLocation(false);
                                        setNewLocationName("");
                                    }}
                                >
                                    ✕
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs gap-1.5"
                            type="button"
                            onClick={() => setAddingLocation(true)}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Adicionar Local
                        </Button>
                    )}
                </div>
            )}

            <Dialog
                open={!!dupLocDialog}
                onOpenChange={(open) => {
                    if (!open) setDupLocDialog(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Duplicar local</DialogTitle>
                        <DialogDescription>Informe o nome para o novo local.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            autoFocus
                            value={dupLocName}
                            onChange={(e) => setDupLocName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleDupLocConfirm();
                                }
                            }}
                            placeholder="Nome do local"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" type="button" onClick={() => setDupLocDialog(null)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            disabled={!dupLocName.trim() || dupLocating}
                            onClick={handleDupLocConfirm}
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function DroppableLocationSections({
    locationId,
    isEmpty,
    children,
}: {
    locationId: string;
    isEmpty: boolean;
    children: ReactNode;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: locationId });
    return (
        <div ref={setNodeRef}>
            {children}
            {isOver && isEmpty && <div className="mx-3 my-1 h-0.5 rounded-full bg-primary/50" />}
        </div>
    );
}

function SortableSectionRow({
    sec,
    locationId,
    budgetId: _budgetId,
    selected,
    onSelect,
    onDuplicate,
    onDelete,
    isReadOnly,
    sectionIndex,
    locationIndex,
    scopeNumber,
}: {
    sec: ScopeSection;
    locationId: string;
    budgetId: string;
    selected: Selection | null;
    onSelect: (sel: Selection) => void;
    onDuplicate: (sectionId: string, sectionName: string, e: MouseEvent) => void;
    onDelete: (sectionId: string, e: MouseEvent) => void;
    isReadOnly: boolean;
    sectionIndex: number;
    locationIndex: number;
    scopeNumber: string;
}) {
    const isSectionSelected = selected?.type === "section" && selected.id === sec.id;
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: sec.id,
        disabled: isReadOnly,
    });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: "20px" }}
            className={cn(
                "group flex items-center gap-1 pr-1 py-1.5 cursor-pointer rounded-sm transition-colors",
                isSectionSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                isDragging && "opacity-40"
            )}
            onClick={() => onSelect({ type: "section", id: sec.id, locationId })}
        >
            {!isReadOnly && (
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className={cn(
                        "shrink-0 cursor-grab active:cursor-grabbing p-0.5 rounded touch-none",
                        isSectionSelected
                            ? "text-primary-foreground/40 hover:text-primary-foreground"
                            : "text-muted-foreground/30 hover:text-muted-foreground"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-3 w-3" />
                </button>
            )}
            <Layers className="h-3.5 w-3.5 shrink-0 opacity-60" />
            {scopeNumber && (
                <span className="shrink-0 text-xs font-mono opacity-40">
                    {scopeNumber}.{locationIndex}.{sectionIndex}.
                </span>
            )}
            <span className="flex-1 truncate text-xs">{sec.name}</span>
            {!isReadOnly && (
                <>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(sec.id, sec.name, e);
                        }}
                        className={cn(
                            "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                            isSectionSelected
                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                : "text-muted-foreground hover:text-primary"
                        )}
                        title="Duplicar trecho"
                    >
                        <Copy className="h-3 w-3" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(sec.id, e);
                        }}
                        className={cn(
                            "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                            isSectionSelected
                                ? "text-primary-foreground hover:bg-primary-foreground/20"
                                : "text-muted-foreground hover:text-destructive"
                        )}
                        title="Excluir trecho"
                    >
                        <Trash2 className="h-3 w-3" />
                    </button>
                </>
            )}
        </div>
    );
}

interface LocationNodeProps {
    location: ScopeLocation;
    locIndex: number;
    scopeNumber: string;
    budgetId: string;
    selected: Selection | null;
    expanded: boolean;
    onToggleExpand: () => void;
    onSelect: (sel: Selection) => void;
    onRefresh: () => void;
    onDelete: (e: MouseEvent) => void;
    onDuplicate: (e: MouseEvent) => void;
    isReadOnly: boolean;
}

function LocationNode({
    location,
    locIndex,
    scopeNumber,
    budgetId,
    selected,
    expanded,
    onToggleExpand,
    onSelect,
    onRefresh,
    onDelete,
    onDuplicate,
    isReadOnly,
}: LocationNodeProps) {
    const [addingSection, setAddingSection] = useState(false);
    const [sectionName, setSectionName] = useState("");
    const [duplicateDialog, setDuplicateDialog] = useState<{
        sectionId: string;
        defaultName: string;
    } | null>(null);
    const [duplicateName, setDuplicateName] = useState("");
    const [duplicating, setDuplicating] = useState(false);

    const isSelected = selected?.type === "location" && selected.id === location.id;

    const handleAddSection = async () => {
        const name = sectionName
            .trim()
            .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        if (!name) return;
        const result = await addSectionAction(location.id, budgetId, name);
        if (result.success) {
            setSectionName("");
            setAddingSection(false);
            await onRefresh();
        } else {
            toast.error(result.error || "Erro ao adicionar trecho");
        }
    };

    const handleDeleteSection = async (sectionId: string, e: MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Remover este trecho e seus itens?")) return;
        const result = await deleteSectionAction(sectionId, budgetId);
        if (result.success) await onRefresh();
        else toast.error(result.error || "Erro ao remover trecho");
    };

    const openDuplicateDialog = (sectionId: string, sectionNameArg: string, e: MouseEvent) => {
        e.stopPropagation();
        const defaultName = `${sectionNameArg} - Cópia`;
        setDuplicateName(defaultName);
        setDuplicateDialog({ sectionId, defaultName });
    };

    const handleDuplicateConfirm = async () => {
        if (!duplicateDialog || duplicating) return;
        setDuplicating(true);
        const result = await duplicateSectionAction(
            duplicateDialog.sectionId,
            budgetId,
            duplicateName.trim() || duplicateDialog.defaultName
        );
        setDuplicating(false);
        setDuplicateDialog(null);
        if (result.success) await onRefresh();
        else toast.error(result.error || "Erro ao duplicar trecho");
    };

    return (
        <div>
            <div
                className={cn(
                    "group flex items-center gap-1 pr-1 py-1.5 cursor-pointer rounded-sm transition-colors",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                )}
                style={{ paddingLeft: "8px" }}
                onClick={() => onSelect({ type: "location", id: location.id })}
            >
                <button
                    type="button"
                    className="shrink-0 opacity-60 hover:opacity-100"
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
                    }}
                >
                    {expanded && location.sections.length > 0 ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                    )}
                </button>
                <Map className="h-3.5 w-3.5 shrink-0 opacity-60" />
                {scopeNumber && (
                    <span className="shrink-0 text-xs font-mono opacity-40">
                        {scopeNumber}.{locIndex}.
                    </span>
                )}
                <span className="flex-1 truncate text-xs font-medium">{location.name}</span>
                {!isReadOnly && (
                    <>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setAddingSection((v) => !v);
                            }}
                            className={cn(
                                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-all",
                                isSelected
                                    ? "text-primary-foreground hover:bg-primary-foreground/20"
                                    : "text-muted-foreground hover:text-primary"
                            )}
                            title="Adicionar trecho"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                        <button
                            type="button"
                            onClick={onDuplicate}
                            className={cn(
                                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                                isSelected
                                    ? "text-primary-foreground hover:bg-primary-foreground/20"
                                    : "text-muted-foreground hover:text-primary"
                            )}
                            title="Duplicar local"
                        >
                            <Copy className="h-3 w-3" />
                        </button>
                        <button
                            type="button"
                            onClick={onDelete}
                            className={cn(
                                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                                isSelected
                                    ? "text-primary-foreground hover:bg-primary-foreground/20"
                                    : "text-muted-foreground hover:text-destructive"
                            )}
                            title="Excluir local"
                        >
                            <Trash2 className="h-3 w-3" />
                        </button>
                    </>
                )}
            </div>

            <DroppableLocationSections
                locationId={location.id}
                isEmpty={location.sections.length === 0}
            >
                {expanded && location.sections.length > 0 && (
                    <SortableContext
                        items={location.sections.map((s) => s.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        {location.sections.map((sec, secIdx) => (
                            <SortableSectionRow
                                key={sec.id}
                                sec={sec}
                                locationId={location.id}
                                budgetId={budgetId}
                                selected={selected}
                                onSelect={onSelect}
                                onDuplicate={openDuplicateDialog}
                                onDelete={handleDeleteSection}
                                isReadOnly={isReadOnly}
                                sectionIndex={secIdx + 1}
                                locationIndex={locIndex}
                                scopeNumber={scopeNumber}
                            />
                        ))}
                    </SortableContext>
                )}
            </DroppableLocationSections>

            {addingSection && !isReadOnly && (
                <div className="py-1.5 space-y-1" style={{ paddingLeft: "28px", paddingRight: "8px" }}>
                    <Input
                        autoFocus
                        placeholder="Nome do trecho..."
                        value={sectionName}
                        onChange={(e) => setSectionName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleAddSection();
                            if (e.key === "Escape") {
                                setAddingSection(false);
                                setSectionName("");
                            }
                        }}
                        className="h-7 text-xs"
                    />
                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            className="h-7 flex-1 text-xs"
                            type="button"
                            onClick={handleAddSection}
                            disabled={!sectionName.trim()}
                        >
                            OK
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            type="button"
                            onClick={() => {
                                setAddingSection(false);
                                setSectionName("");
                            }}
                        >
                            ✕
                        </Button>
                    </div>
                </div>
            )}

            <Dialog
                open={!!duplicateDialog}
                onOpenChange={(open) => {
                    if (!open) setDuplicateDialog(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Duplicar trecho</DialogTitle>
                        <DialogDescription>Informe o nome para o novo trecho.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            autoFocus
                            value={duplicateName}
                            onChange={(e) => setDuplicateName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleDuplicateConfirm();
                                }
                            }}
                            placeholder="Nome do trecho"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" type="button" onClick={() => setDuplicateDialog(null)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            disabled={!duplicateName.trim() || duplicating}
                            onClick={handleDuplicateConfirm}
                        >
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
