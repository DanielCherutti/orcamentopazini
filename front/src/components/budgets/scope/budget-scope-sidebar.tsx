"use client";

import {
    useState,
    useEffect,
    useRef,
    useCallback,
    type KeyboardEvent,
    type MouseEvent,
    type PointerEvent as ReactPointerEvent,
    type ReactNode,
} from "react";
import {
    Plus,
    Trash2,
    Copy,
    ChevronRight,
    ChevronDown,
    Map as MapIcon,
    Layers,
    GripVertical,
} from "lucide-react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    pointerWithin,
    PointerSensor,
    useSensor,
    useSensors,
    useDroppable,
    useDndContext,
    type CollisionDetection,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
    defaultAnimateLayoutChanges,
    type AnimateLayoutChanges,
} from "@dnd-kit/sortable";
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
    reorderLocationsAction,
    moveSectionAction,
} from "@/actions/budget-hierarchy-scope-structure-actions";
import type { Selection } from "./budget-scope-types";

const SCOPE_SIDEBAR_WIDTH_STORAGE_KEY = "pazini-scope-sidebar-width-px";
const SCOPE_SIDEBAR_WIDTH_DEFAULT = 320;
const SCOPE_SIDEBAR_WIDTH_MIN = 240;
const SCOPE_SIDEBAR_WIDTH_MAX = 560;

function clampScopeSidebarWidth(px: number): number {
    return Math.min(SCOPE_SIDEBAR_WIDTH_MAX, Math.max(SCOPE_SIDEBAR_WIDTH_MIN, Math.round(px)));
}

function persistScopeSidebarWidth(px: number) {
    try {
        localStorage.setItem(SCOPE_SIDEBAR_WIDTH_STORAGE_KEY, String(px));
    } catch {
        /* ignore */
    }
}

/** Zona para soltar trecho em local vazio — não pode ser igual ao id sortable do local. */
const LOCATION_SECTION_DROP_PREFIX = "scope-drop-loc:";
/** Ids sortable de local (evita colisão com trechos no mesmo DndContext). */
const LOCATION_SORT_PREFIX = "scope-sort-loc:";
/** Ids sortable de trecho. */
const SECTION_SORT_PREFIX = "scope-sort-sec:";

const scopeSidebarCollision: CollisionDetection = (args) => {
    const activeStr = String(args.active.id);
    if (activeStr.startsWith(SECTION_SORT_PREFIX)) {
        const byPointer = pointerWithin(args);
        if (byPointer.length > 0) {
            const sectionFirst = byPointer.filter((c) => String(c.id).startsWith(SECTION_SORT_PREFIX));
            if (sectionFirst.length > 0) return sectionFirst;
            return byPointer;
        }
    }
    return closestCorners(args);
};

/**
 * O alvo visual do drop costuma ser o droppable interno (`scope-drop-loc:`) ou um trecho,
 * não o id sortable do local (`scope-sort-loc:`). Sem isto, o handler faz return e nada muda.
 */
function resolveLocationIdFromOver(overRaw: string, list: ScopeLocation[]): string | null {
    if (overRaw.startsWith(LOCATION_SORT_PREFIX)) return stripLocationSortId(overRaw);
    if (overRaw.startsWith(LOCATION_SECTION_DROP_PREFIX)) {
        return overRaw.slice(LOCATION_SECTION_DROP_PREFIX.length);
    }
    if (overRaw.startsWith(SECTION_SORT_PREFIX)) {
        const secId = stripSectionSortId(overRaw);
        const loc = list.find((l) => l.sections.some((s) => s.id === secId));
        return loc?.id ?? null;
    }
    return null;
}

const animateLocationItem: AnimateLayoutChanges = (args) => {
    const aid = args.active?.id != null ? String(args.active.id) : "";
    if (aid.startsWith(SECTION_SORT_PREFIX)) return false;
    return defaultAnimateLayoutChanges(args);
};

const animateSectionItem: AnimateLayoutChanges = (args) => {
    const aid = args.active?.id != null ? String(args.active.id) : "";
    if (aid.startsWith(LOCATION_SORT_PREFIX)) return false;
    return defaultAnimateLayoutChanges(args);
};

function stripLocationSortId(id: string): string {
    return id.startsWith(LOCATION_SORT_PREFIX) ? id.slice(LOCATION_SORT_PREFIX.length) : id;
}

function stripSectionSortId(id: string): string {
    return id.startsWith(SECTION_SORT_PREFIX) ? id.slice(SECTION_SORT_PREFIX.length) : id;
}

/** Preview do overlay: lê `active` do contexto — evita setState no pai em onDragStart (que quebrava o arraste). */
function ScopeSidebarDragOverlay({
    localLocations,
    scopeNumber,
}: {
    localLocations: ScopeLocation[];
    scopeNumber: string;
}) {
    const { active } = useDndContext();
    if (!active) return null;
    const dragId = String(active.id);

    if (dragId.startsWith(LOCATION_SORT_PREFIX)) {
        const locId = stripLocationSortId(dragId);
        const loc = localLocations.find((l) => l.id === locId);
        const idx = localLocations.findIndex((l) => l.id === locId) + 1;
        if (!loc) return null;
        return (
            <div className="w-[min(100%,17.5rem)] rounded-lg border border-border/80 bg-background shadow-lg ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
                <div className="flex items-center gap-1.5 px-2 py-2">
                    <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <MapIcon className="h-3.5 w-3.5 opacity-90" />
                    </div>
                    {scopeNumber && (
                        <span className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
                            {scopeNumber}.{idx}.
                        </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight">{loc.name}</span>
                </div>
            </div>
        );
    }

    if (dragId.startsWith(SECTION_SORT_PREFIX)) {
        const secId = stripSectionSortId(dragId);
        for (let li = 0; li < localLocations.length; li++) {
            const l = localLocations[li];
            const sec = l.sections.find((s) => s.id === secId);
            if (!sec) continue;
            const si = l.sections.findIndex((s) => s.id === secId) + 1;
            return (
                <div className="ml-1 w-[min(100%,16.5rem)] rounded-md border border-border/80 bg-background py-1.5 pl-2 pr-1 shadow-md ring-1 ring-black/[0.05] dark:ring-white/[0.06]">
                    <div className="flex items-center gap-1">
                        <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <Layers className="h-3.5 w-3.5 shrink-0 text-primary/50" />
                        {scopeNumber && (
                            <span className="shrink-0 rounded bg-muted/80 px-1 py-0.5 font-mono text-[10px] font-medium tabular-nums text-muted-foreground">
                                {scopeNumber}.{li + 1}.{si}.
                            </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] leading-snug">{sec.name}</span>
                    </div>
                </div>
            );
        }
    }

    return null;
}

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
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com `locations` após refresh do pai
        setLocalLocations(locations);
    }, [locations]);

    const dndSensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const [sidebarWidthPx, setSidebarWidthPx] = useState(SCOPE_SIDEBAR_WIDTH_DEFAULT);
    const sidebarWidthRef = useRef(SCOPE_SIDEBAR_WIDTH_DEFAULT);

    useEffect(() => {
        sidebarWidthRef.current = sidebarWidthPx;
    }, [sidebarWidthPx]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SCOPE_SIDEBAR_WIDTH_STORAGE_KEY);
            if (!raw) return;
            const n = Number.parseInt(raw, 10);
            if (Number.isNaN(n)) return;
            const clamped = clampScopeSidebarWidth(n);
            sidebarWidthRef.current = clamped;
            setSidebarWidthPx(clamped);
        } catch {
            /* ignore */
        }
    }, []);

    const handleSidebarResizePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = sidebarWidthRef.current;

        const onMove = (ev: PointerEvent) => {
            const delta = ev.clientX - startX;
            const next = clampScopeSidebarWidth(startW + delta);
            sidebarWidthRef.current = next;
            setSidebarWidthPx(next);
        };

        const onUp = () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            document.body.style.removeProperty("cursor");
            document.body.style.removeProperty("user-select");
            persistScopeSidebarWidth(sidebarWidthRef.current);
        };

        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }, []);

    const handleSidebarResizeKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
        const step = e.shiftKey ? 32 : 16;
        let next = sidebarWidthRef.current;
        if (e.key === "ArrowLeft") {
            e.preventDefault();
            next = clampScopeSidebarWidth(next - step);
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            next = clampScopeSidebarWidth(next + step);
        } else if (e.key === "Home") {
            e.preventDefault();
            next = SCOPE_SIDEBAR_WIDTH_MIN;
        } else if (e.key === "End") {
            e.preventDefault();
            next = SCOPE_SIDEBAR_WIDTH_MAX;
        } else {
            return;
        }
        sidebarWidthRef.current = next;
        setSidebarWidthPx(next);
        persistScopeSidebarWidth(next);
    }, []);

    const resetSidebarWidth = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const d = SCOPE_SIDEBAR_WIDTH_DEFAULT;
        sidebarWidthRef.current = d;
        setSidebarWidthPx(d);
        persistScopeSidebarWidth(d);
    }, []);

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const activeId = String(active.id);
        const overRaw = String(over.id);
        const snapshot = localLocations.map((l) => ({ ...l, sections: [...l.sections] }));

        /* Reordenar locais do escopo */
        if (activeId.startsWith(LOCATION_SORT_PREFIX)) {
            const activeLocId = stripLocationSortId(activeId);
            const overLocId = resolveLocationIdFromOver(overRaw, snapshot);
            if (
                !overLocId ||
                !snapshot.some((l) => l.id === activeLocId) ||
                !snapshot.some((l) => l.id === overLocId)
            ) {
                return;
            }
            const oldIdx = snapshot.findIndex((l) => l.id === activeLocId);
            const newIdx = snapshot.findIndex((l) => l.id === overLocId);
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
            const reordered = arrayMove(snapshot, oldIdx, newIdx);
            setLocalLocations(reordered);
            const result = await reorderLocationsAction(
                reordered.map((l) => l.id),
                budgetId
            );
            if (!result.success) {
                setLocalLocations(snapshot);
                toast.error(result.error || "Erro ao reordenar locais");
            }
            return;
        }

        /* Trechos: reordenar dentro do local ou mover para outro local */
        if (!activeId.startsWith(SECTION_SORT_PREFIX)) return;
        const activeSectionId = stripSectionSortId(activeId);

        const overLocIdFromChrome =
            overRaw.startsWith(LOCATION_SECTION_DROP_PREFIX)
                ? overRaw.slice(LOCATION_SECTION_DROP_PREFIX.length)
                : overRaw.startsWith(LOCATION_SORT_PREFIX)
                  ? stripLocationSortId(overRaw)
                  : undefined;

        const srcLoc = snapshot.find((l) => l.sections.some((s) => s.id === activeSectionId));
        if (!srcLoc) return;

        const tgtLoc =
            (overLocIdFromChrome !== undefined
                ? snapshot.find((l) => l.id === overLocIdFromChrome)
                : undefined) ??
            snapshot.find((l) => l.sections.some((s) => `${SECTION_SORT_PREFIX}${s.id}` === overRaw)) ??
            (() => {
                const lid = resolveLocationIdFromOver(overRaw, snapshot);
                return lid ? snapshot.find((l) => l.id === lid) : undefined;
            })();
        if (!tgtLoc) return;

        if (srcLoc.id === tgtLoc.id) {
            const sections = [...srcLoc.sections];
            const oldIdx = sections.findIndex((s) => s.id === activeSectionId);
            let newIdx: number;
            if (overRaw.startsWith(SECTION_SORT_PREFIX)) {
                newIdx = sections.findIndex((s) => `${SECTION_SORT_PREFIX}${s.id}` === overRaw);
            } else if (
                overRaw.startsWith(LOCATION_SORT_PREFIX) ||
                overRaw.startsWith(LOCATION_SECTION_DROP_PREFIX)
            ) {
                const lid =
                    overRaw.startsWith(LOCATION_SORT_PREFIX)
                        ? stripLocationSortId(overRaw)
                        : overRaw.slice(LOCATION_SECTION_DROP_PREFIX.length);
                if (lid !== srcLoc.id) return;
                /* Soltou na barra ou na zona do cartão: topo da lista de trechos */
                newIdx = 0;
            } else {
                return;
            }
            if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
            const reordered = arrayMove(sections, oldIdx, newIdx);
            setLocalLocations((locs) =>
                locs.map((l) => (l.id === srcLoc.id ? { ...l, sections: reordered } : l))
            );
            const result = await reorderSectionsAction(reordered.map((s) => s.id), budgetId);
            if (!result.success) {
                setLocalLocations(snapshot);
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
                setLocalLocations(snapshot);
                toast.error(result.error || "Erro ao mover trecho");
            } else onRefresh();
        }
    };

    const [addingLocation, setAddingLocation] = useState(false);
    const [newLocationName, setNewLocationName] = useState("");
    const [expandedLocations, setExpandedLocations] = useState<Set<string>>(
        () => new Set(locations.map((l) => l.id))
    );

    /** Evita reexpandir todos os locais a cada refresh de `locations` (ex.: ao selecionar um trecho). */
    const prevLocationIdSetRef = useRef<Set<string> | null>(null);

    useEffect(() => {
        const currentIds = new Set(locations.map((l) => l.id));
        const prevIds = prevLocationIdSetRef.current;

        setExpandedLocations((expanded) => {
            const next = new Set(expanded);
            for (const id of [...next]) {
                if (!currentIds.has(id)) next.delete(id);
            }
            if (prevIds === null) {
                for (const id of currentIds) next.add(id);
            } else {
                for (const id of currentIds) {
                    if (!prevIds.has(id)) next.add(id);
                }
            }
            return next;
        });

        prevLocationIdSetRef.current = currentIds;
    }, [locations]);

    /** Local (pai): só ele expandido e todos os trechos visíveis. Trecho: só o pai expandido e só aquele trecho na lista. */
    useEffect(() => {
        if (!selected) return;
        if (selected.type === "location") {
            setExpandedLocations(new Set([selected.id]));
        } else if (selected.type === "section") {
            setExpandedLocations(new Set([selected.locationId]));
        }
    }, [selected]);

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

    const locationCount = localLocations.length;
    const sectionCount = localLocations.reduce((n, l) => n + l.sections.length, 0);

    return (
        <aside
            className="relative shrink-0 flex flex-col border-r border-primary/10 bg-gradient-to-b from-card via-card to-primary/[0.02] shadow-[inset_-1px_0_0_0_hsl(var(--border))]"
            style={{ width: sidebarWidthPx }}
        >
            <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar índice do escopo"
                aria-valuenow={sidebarWidthPx}
                aria-valuemin={SCOPE_SIDEBAR_WIDTH_MIN}
                aria-valuemax={SCOPE_SIDEBAR_WIDTH_MAX}
                tabIndex={0}
                onPointerDown={handleSidebarResizePointerDown}
                onDoubleClick={resetSidebarWidth}
                onKeyDown={handleSidebarResizeKeyDown}
                title="Arraste para ajustar a largura. Duplo clique para largura padrão."
                className={cn(
                    "group/resize absolute right-0 top-0 z-40 flex h-full w-3 -translate-x-1/2 cursor-col-resize touch-none select-none",
                    "items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-0"
                )}
            >
                <span
                    className="h-12 w-1 rounded-full bg-border/80 transition-colors group-hover/resize:bg-primary/50"
                    aria-hidden
                />
            </div>
            <div className="shrink-0 border-b border-primary/10 bg-primary/[0.06] px-3 py-3">
                <div className="flex items-start gap-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
                        <MapIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                        <h3 className="text-sm font-semibold tracking-tight text-foreground">Índice do escopo</h3>
                        <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">
                            Locais e trechos do orçamento
                        </p>
                        {(locationCount > 0 || sectionCount > 0) && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/60">
                                    {locationCount} {locationCount === 1 ? "local" : "locais"}
                                </span>
                                <span className="inline-flex items-center rounded-md bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border/60">
                                    {sectionCount} {sectionCount === 1 ? "trecho" : "trechos"}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 [scrollbar-gutter:stable]">
                <DndContext
                    sensors={dndSensors}
                    collisionDetection={scopeSidebarCollision}
                    onDragEnd={handleDragEnd}
                >
                    <nav className="p-2.5 space-y-2">
                        {localLocations.length === 0 && !addingLocation && (
                            <div className="mx-1 rounded-lg border border-dashed border-primary/20 bg-primary/[0.03] px-3 py-6 text-center">
                                <Layers className="mx-auto h-8 w-8 text-primary/25 mb-2" />
                                <p className="text-xs font-medium text-foreground/80">Nenhum local ainda</p>
                                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                                    Use o botão abaixo para criar o primeiro local do escopo.
                                </p>
                            </div>
                        )}
                        <SortableContext
                            items={localLocations.map((l) => `${LOCATION_SORT_PREFIX}${l.id}`)}
                            strategy={verticalListSortingStrategy}
                        >
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
                        </SortableContext>
                    </nav>
                    <DragOverlay dropAnimation={null}>
                        <ScopeSidebarDragOverlay localLocations={localLocations} scopeNumber={scopeNumber} />
                    </DragOverlay>
                </DndContext>
            </div>

            {!isReadOnly && (
                <div className="shrink-0 border-t border-primary/10 bg-muted/20 p-2.5">
                    {addingLocation ? (
                        <div className="space-y-2 rounded-lg border border-border bg-card p-2 shadow-sm">
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
                                className="h-8 text-xs"
                            />
                            <div className="flex gap-1.5">
                                <Button
                                    size="sm"
                                    className="h-8 flex-1 text-xs"
                                    type="button"
                                    onClick={handleAddLocation}
                                    disabled={!newLocationName.trim()}
                                >
                                    Adicionar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2 text-xs"
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
                            variant="default"
                            size="sm"
                            className="w-full h-9 text-xs gap-2 font-medium shadow-sm"
                            type="button"
                            onClick={() => setAddingLocation(true)}
                        >
                            <Plus className="h-4 w-4" />
                            Novo local
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
        </aside>
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
    const { setNodeRef, isOver } = useDroppable({
        id: `${LOCATION_SECTION_DROP_PREFIX}${locationId}`,
    });
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
        id: `${SECTION_SORT_PREFIX}${sec.id}`,
        disabled: isReadOnly,
        animateLayoutChanges: animateSectionItem,
    });

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cn(
                "group ml-1 flex items-center gap-1 border-l-2 border-primary/15 pl-2 pr-1 py-1.5 cursor-pointer rounded-md transition-colors",
                isSectionSelected
                    ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-background/80",
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
                            : "text-muted-foreground/35 hover:text-muted-foreground"
                    )}
                    onClick={(e) => e.stopPropagation()}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </button>
            )}
            <Layers
                className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isSectionSelected ? "opacity-90" : "text-primary/50"
                )}
            />
            {scopeNumber && (
                <span
                    className={cn(
                        "shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-medium tabular-nums",
                        isSectionSelected
                            ? "bg-primary-foreground/15 text-primary-foreground/90"
                            : "bg-muted/80 text-muted-foreground"
                    )}
                >
                    {scopeNumber}.{locationIndex}.{sectionIndex}.
                </span>
            )}
            <span className="flex-1 truncate text-[12.5px] leading-snug">{sec.name}</span>
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
    const {
        attributes,
        listeners,
        setDroppableNodeRef,
        setDraggableNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: `${LOCATION_SORT_PREFIX}${location.id}`,
        disabled: isReadOnly,
        animateLayoutChanges: animateLocationItem,
    });

    const [addingSection, setAddingSection] = useState(false);
    const [sectionName, setSectionName] = useState("");
    const [duplicateDialog, setDuplicateDialog] = useState<{
        sectionId: string;
        defaultName: string;
    } | null>(null);
    const [duplicateName, setDuplicateName] = useState("");
    const [duplicating, setDuplicating] = useState(false);

    const isSelected = selected?.type === "location" && selected.id === location.id;
    /** Índice sempre lista todos os trechos; só o painel principal muda (todos empilhados vs um trecho). */
    const hasBodyBelow =
        (expanded && location.sections.length > 0) || addingSection;

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
        <>
        <div className="rounded-lg border border-border/80 bg-background/60 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
            <div ref={setDroppableNodeRef} className="flex flex-col">
            <div
                ref={setDraggableNodeRef}
                style={{ transform: CSS.Transform.toString(transform), transition }}
                className={cn(isDragging && "relative z-20 opacity-40")}
            >
            <div
                className={cn(
                    "group flex items-center gap-1.5 px-2 py-2 cursor-pointer transition-colors",
                    hasBodyBelow ? "rounded-t-lg" : "rounded-lg",
                    isSelected
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted/70"
                )}
                onClick={() => onSelect({ type: "location", id: location.id })}
            >
                {!isReadOnly && (
                    <button
                        type="button"
                        {...attributes}
                        {...listeners}
                        className={cn(
                            "shrink-0 cursor-grab touch-none rounded p-0.5 active:cursor-grabbing",
                            isSelected
                                ? "text-primary-foreground/50 hover:text-primary-foreground"
                                : "text-muted-foreground/40 hover:text-muted-foreground"
                        )}
                        onClick={(e) => e.stopPropagation()}
                        title="Arrastar para reordenar o local"
                    >
                        <GripVertical className="h-4 w-4" />
                    </button>
                )}
                <button
                    type="button"
                    className={cn(
                        "shrink-0 rounded p-0.5 transition-colors",
                        isSelected
                            ? "text-primary-foreground/80 hover:bg-primary-foreground/15"
                            : "text-muted-foreground hover:bg-muted"
                    )}
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleExpand();
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
                        isSelected ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"
                    )}
                >
                    <MapIcon className="h-3.5 w-3.5 opacity-90" />
                </div>
                {scopeNumber && (
                    <span
                        className={cn(
                            "shrink-0 rounded px-1 py-0.5 text-[10px] font-mono font-medium tabular-nums",
                            isSelected
                                ? "bg-primary-foreground/15 text-primary-foreground/90"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        {scopeNumber}.{locIndex}.
                    </span>
                )}
                <span className="flex-1 truncate text-[13px] font-semibold leading-tight">{location.name}</span>
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
            </div>

            <DroppableLocationSections
                locationId={location.id}
                isEmpty={location.sections.length === 0}
            >
                {expanded && location.sections.length > 0 && (
                    <SortableContext
                        items={location.sections.map((s) => `${SECTION_SORT_PREFIX}${s.id}`)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="border-t border-border/60 bg-muted/20 px-1.5 py-1.5 rounded-b-lg">
                        {location.sections.map((sec) => {
                            const sectionIndex =
                                location.sections.findIndex((s) => s.id === sec.id) + 1;
                            return (
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
                                sectionIndex={sectionIndex}
                                locationIndex={locIndex}
                                scopeNumber={scopeNumber}
                            />
                            );
                        })}
                        </div>
                    </SortableContext>
                )}
            </DroppableLocationSections>

            {addingSection && !isReadOnly && (
                <div className="border-t border-border/60 bg-muted/10 px-2 py-2 space-y-1.5 rounded-b-lg">
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
                        className="h-8 text-xs"
                    />
                    <div className="flex gap-1.5">
                        <Button
                            size="sm"
                            className="h-8 flex-1 text-xs"
                            type="button"
                            onClick={handleAddSection}
                            disabled={!sectionName.trim()}
                        >
                            Adicionar trecho
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs"
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
            </div>
        </div>

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
        </>
    );
}
