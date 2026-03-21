"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, Copy, Loader2, ChevronRight, ChevronDown, Map, Layers, Pencil, GripVertical, PanelLeftClose, PanelLeftOpen,
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
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { cn, toAbsoluteImageUrl } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { CompositorRichTextEditor, CollapsibleEditorSection } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { BudgetImageGallery } from "@/components/budgets/budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "@/components/budgets/budget-photo-annotator-dialog";
import { AddGroupDialog } from "@/components/budgets/editor/add-group-dialog";
import { ProductSelector } from "@/components/products/product-selector";
import type { Product } from "@/actions/product-actions";
import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import {
  getLocationsAction,
  type ScopeLocation,
  type ScopeSection,
} from "@/actions/budget-scope-actions";
import {
  addLocationAction,
  updateLocationAction,
  deleteLocationAction,
  addSectionAction,
  updateSectionAction,
  deleteSectionAction,
  addItemAction,
  deleteItemAction,
  updateItemQuantityAction,
  updateItemGroupInSectionAction,
  getItemsBySectionAction,
  addGroupToSectionAction,
  duplicateSectionAction,
  duplicateLocationAction,
  reorderSectionItemsAction,
  moveSectionAction,
  reorderSectionsAction,
} from "@/actions/budget-hierarchy-actions";
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import {
  getBudgetImagesByLocation,
  getBudgetImagesBySection,
  deleteBudgetImage,
} from "@/actions/budget-annotations";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

const NO_GROUP_VALUE = "__none__";

type ItemSegment =
  | { type: "standalone"; item: BudgetItem }
  | { type: "group"; id: string; name: string; items: BudgetItem[] };

function buildItemSegments(items: BudgetItem[]): ItemSegment[] {
  const segments: ItemSegment[] = [];
  for (const item of items) {
    const gid = (item as Record<string, unknown>).group_id as string | undefined;
    if (!gid) {
      segments.push({ type: "standalone", item });
    } else {
      const last = segments[segments.length - 1];
      if (last && last.type === "group" && last.id === gid) {
        last.items.push(item);
      } else {
        const gname = ((item as Record<string, unknown>).group_name as string) ?? gid;
        segments.push({ type: "group", id: gid, name: gname, items: [item] });
      }
    }
  }
  return segments;
}

// ─── SortableItemsList ────────────────────────────────────────────────────────

function SortableItemsList({
  items,
  budgetId,
  isReadOnly,
  onRefresh,
  groups = [],
}: {
  items: BudgetItem[];
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  groups?: ProductGroup[];
}) {
  const [segments, setSegments] = useState<ItemSegment[]>(() => buildItemSegments(items));
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  useEffect(() => {
    setSegments(buildItemSegments(items));
  }, [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const segmentIds = segments.map((seg) =>
    seg.type === "standalone" ? seg.item.id! : `group:${seg.id}`
  );

  const flattenToIds = (segs: ItemSegment[]) =>
    segs.flatMap((seg) =>
      seg.type === "standalone" ? [seg.item.id!] : seg.items.map((i) => i.id!)
    );

  const handleOuterDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Ignora eventos que vieram de dentro de um grupo (id format: group:xxx/item:xxx)
    const activeStr = active.id as string;
    const overStr = over.id as string;
    // Se ambos existem em segmentIds, é um reorder válido de segmentos
    const oldIdx = segmentIds.indexOf(activeStr);
    const newIdx = segmentIds.indexOf(overStr);
    if (oldIdx === -1 || newIdx === -1) return; // evento interno ao grupo, ignorar

    const prevSegs = segmentsRef.current;
    const newSegs = arrayMove(prevSegs, oldIdx, newIdx);
    setSegments(newSegs);
    const result = await reorderSectionItemsAction(flattenToIds(newSegs), budgetId);
    if (!result.success) {
      setSegments(prevSegs);
      toast.error("Erro ao reordenar itens");
    }
  };

  const handleGroupItemReorder = useCallback(
    async (groupId: string, oldIdx: number, newIdx: number) => {
      const current = segmentsRef.current;
      const segIdx = current.findIndex((s) => s.type === "group" && s.id === groupId);
      if (segIdx === -1) return;
      const seg = current[segIdx] as Extract<ItemSegment, { type: "group" }>;
      const newItems = arrayMove(seg.items, oldIdx, newIdx);
      const newSegs = current.map((s, i) =>
        i === segIdx ? ({ ...s, items: newItems } as ItemSegment) : s
      );
      setSegments(newSegs);
      const result = await reorderSectionItemsAction(flattenToIds(newSegs), budgetId);
      if (!result.success) {
        setSegments(current);
        toast.error("Erro ao reordenar itens");
      }
    },
    [budgetId] // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleOuterDragEnd}>
      <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {segments.map((seg) =>
            seg.type === "standalone" ? (
              <SortableStandaloneItem
                key={seg.item.id}
                item={seg.item}
                budgetId={budgetId}
                isReadOnly={isReadOnly}
                onRefresh={onRefresh}
                groups={groups}
              />
            ) : (
              <SortableGroup
                key={seg.id}
                seg={seg}
                sensors={sensors}
                budgetId={budgetId}
                isReadOnly={isReadOnly}
                onRefresh={onRefresh}
                onItemReorder={handleGroupItemReorder}
                groups={groups}
              />
            )
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableStandaloneItem({
  item,
  budgetId,
  isReadOnly,
  onRefresh,
  groups,
}: {
  item: BudgetItem;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  groups: ProductGroup[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id!,
    disabled: isReadOnly,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 z-10 relative")}>
      <ScopeItemRow
        item={item}
        budgetId={budgetId}
        isReadOnly={isReadOnly}
        onRefresh={onRefresh}
        groups={groups}
        dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

function SortableGroup({
  seg,
  sensors,
  budgetId,
  isReadOnly,
  onRefresh,
  onItemReorder,
  groups,
}: {
  seg: Extract<ItemSegment, { type: "group" }>;
  sensors: ReturnType<typeof useSensors>;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  onItemReorder: (groupId: string, oldIdx: number, newIdx: number) => void;
  groups: ProductGroup[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `group:${seg.id}`,
    disabled: isReadOnly,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const groupItemIds = seg.items.map((i) => i.id!);

  return (
    <div ref={setNodeRef} style={style} className={cn(isDragging && "opacity-50 z-10 relative")}>
      <div className="flex items-center gap-2 mt-2 mb-1 px-1">
        {!isReadOnly && (
          <button
            {...attributes}
            {...listeners}
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
          {seg.name}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
      {/* DndContext separado para itens dentro do grupo — usa id único para isolar eventos */}
      <DndContext
        id={`group-dnd-${seg.id}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          const { active, over } = event;
          if (!over || active.id === over.id) return;
          const oldIdx = seg.items.findIndex((i) => i.id === active.id);
          const newIdx = seg.items.findIndex((i) => i.id === over.id);
          if (oldIdx !== -1 && newIdx !== -1) onItemReorder(seg.id, oldIdx, newIdx);
        }}
      >
        <SortableContext items={groupItemIds} strategy={verticalListSortingStrategy}>
          {seg.items.map((item) => (
            <SortableGroupItem
              key={item.id}
              item={item}
              budgetId={budgetId}
              isReadOnly={isReadOnly}
              onRefresh={onRefresh}
              groups={groups}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="h-px bg-border mt-1" />
    </div>
  );
}

function SortableGroupItem({
  item,
  budgetId,
  isReadOnly,
  onRefresh,
  groups,
}: {
  item: BudgetItem;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  groups: ProductGroup[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id!,
    disabled: isReadOnly,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} className={cn("mb-1", isDragging && "opacity-50 z-10 relative")}>
      <ScopeItemRow
        item={item}
        budgetId={budgetId}
        isReadOnly={isReadOnly}
        onRefresh={onRefresh}
        groups={groups}
        indented
        dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
      />
    </div>
  );
}

// ─── BudgetScope ──────────────────────────────────────────────────────────────

interface BudgetScopeProps {
  budgetId: string;
  isReadOnly?: boolean;
}

type Selection =
  | { type: "location"; id: string }
  | { type: "section"; id: string; locationId: string };

export function BudgetScope({ budgetId, isReadOnly = false }: BudgetScopeProps) {
  const [locations, setLocations] = useState<ScopeLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Selection | null>(null);
  // Número hierárquico do bloco Escopo no compositor (ex: "3")
  const [scopeNumber, setScopeNumber] = useState<string>("");

  const loadLocations = useCallback(async () => {
    const result = await getLocationsAction(budgetId);
    if (result.success && result.data) {
      setLocations(result.data);
    }
  }, [budgetId]);

  // Busca o número do bloco scope no compositor
  const loadScopeNumber = useCallback(async () => {
    const { getCompositorTreeAction } = await import("@/actions/budget-compositor-actions");
    const { buildTree } = await import("@/types/budget-compositor-types");
    const res = await getCompositorTreeAction(budgetId);
    if (res.success && res.blocks) {
      const tree = buildTree(res.blocks);
      const flattenLocal = (nodes: typeof tree.blocks): typeof tree.blocks => {
        const out: typeof tree.blocks = [];
        for (const n of nodes) { out.push(n); out.push(...flattenLocal(n.children)); }
        return out;
      };
      const scopeBlock = flattenLocal(tree.blocks).find(b => b.type === "scope");
      if (scopeBlock) setScopeNumber(scopeBlock.number);
    }
  }, [budgetId]);

  useEffect(() => {
    Promise.all([loadLocations(), loadScopeNumber()]).finally(() => setLoading(false));
  }, [loadLocations, loadScopeNumber]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <ScopeSidebar
          budgetId={budgetId}
          locations={locations}
          selected={selected}
          onSelect={setSelected}
          onRefresh={loadLocations}
          isReadOnly={isReadOnly}
          scopeNumber={scopeNumber}
        />
      )}

      {/* Painel direito — fundo azulado, largura total */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-primary/[0.015]">
        {/* Toggle de sidebar — mesmo padrão do compositor */}
        <div className="shrink-0 flex items-center px-3 py-1.5 border-b border-primary/15 bg-primary/[0.02]">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-primary/60 hover:text-primary transition-colors"
            title={sidebarOpen ? "Ocultar índice" : "Mostrar índice"}
          >
            {sidebarOpen
              ? <PanelLeftClose className="h-4 w-4" />
              : <PanelLeftOpen className="h-4 w-4" />}
            <span>{sidebarOpen ? "Ocultar índice" : "Mostrar índice"}</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <Map className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">Selecione um local ou adicione um novo para começar</p>
            </div>
          ) : selected.type === "location" ? (
            <LocationDetail
              key={selected.id}
              locationId={selected.id}
              location={locations.find((l) => l.id === selected.id) ?? null}
              budgetId={budgetId}
              isReadOnly={isReadOnly}
              onRefresh={loadLocations}
              onSelectSection={(sectionId) => {
                setSelected({ type: "section", id: sectionId, locationId: selected.id });
              }}
            />
          ) : (
            <SectionDetail
              key={selected.id}
              sectionId={selected.id}
              locationId={selected.locationId}
              section={
                locations
                  .find((l) => l.sections.some((s) => s.id === selected.id))
                  ?.sections.find((s) => s.id === selected.id) ?? null
              }
              budgetId={budgetId}
              isReadOnly={isReadOnly}
              onRefresh={loadLocations}
              locations={locations}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ScopeSidebar ─────────────────────────────────────────────────────────────

interface ScopeSidebarProps {
  budgetId: string;
  locations: ScopeLocation[];
  selected: Selection | null;
  onSelect: (sel: Selection) => void;
  onRefresh: () => void;
  isReadOnly: boolean;
  scopeNumber: string;
}

function ScopeSidebar({ budgetId, locations, selected, onSelect, onRefresh, isReadOnly, scopeNumber }: ScopeSidebarProps) {
  const [localLocations, setLocalLocations] = useState(locations);
  const locationsRef = useRef(locations);
  locationsRef.current = locations;
  useEffect(() => { setLocalLocations(locations); }, [locations]);

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleSectionDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const activeSectionId = active.id as string;
    const overId = over.id as string;
    const orig = locationsRef.current;

    // Localizar origem
    const srcLoc = orig.find((l) => l.sections.some((s) => s.id === activeSectionId));
    if (!srcLoc) return;

    // Localizar destino: pode ser um location.id ou um section.id
    const tgtLoc = orig.find((l) => l.id === overId)
      ?? orig.find((l) => l.sections.some((s) => s.id === overId));
    if (!tgtLoc) return;

    if (srcLoc.id === tgtLoc.id) {
      // Reordenar dentro do mesmo local
      const sections = srcLoc.sections;
      const oldIdx = sections.findIndex((s) => s.id === activeSectionId);
      const newIdx = sections.findIndex((s) => s.id === overId);
      if (oldIdx === -1 || newIdx === -1 || oldIdx === newIdx) return;
      const reordered = arrayMove(sections, oldIdx, newIdx);
      setLocalLocations((locs) =>
        locs.map((l) => (l.id === srcLoc.id ? { ...l, sections: reordered } : l))
      );
      const result = await reorderSectionsAction(reordered.map((s) => s.id), budgetId);
      if (!result.success) { setLocalLocations(orig); toast.error("Erro ao reordenar trechos"); }
    } else {
      // Mover para outro local
      const section = srcLoc.sections.find((s) => s.id === activeSectionId)!;
      setLocalLocations((locs) =>
        locs.map((l) => {
          if (l.id === srcLoc.id) return { ...l, sections: l.sections.filter((s) => s.id !== activeSectionId) };
          if (l.id === tgtLoc.id) return { ...l, sections: [...l.sections, section] };
          return l;
        })
      );
      const result = await moveSectionAction(activeSectionId, tgtLoc.id, budgetId);
      if (!result.success) { setLocalLocations(orig); toast.error(result.error || "Erro ao mover trecho"); }
      else onRefresh();
    }
  };

  const [addingLocation, setAddingLocation] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(
    () => new Set(locations.map((l) => l.id))
  );

  // Expande automaticamente novos locais adicionados
  useEffect(() => {
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

  const [dupLocDialog, setDupLocDialog] = useState<{ locationId: string; defaultName: string } | null>(null);
  const [dupLocName, setDupLocName] = useState("");
  const [dupLocating, setDupLocating] = useState(false);

  const handleDeleteLocation = async (locationId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remover este local e todos os seus trechos?")) return;
    const result = await deleteLocationAction(locationId, budgetId);
    if (result.success) {
      await onRefresh();
    } else {
      toast.error(result.error || "Erro ao remover local");
    }
  };

  const openDupLocDialog = (locationId: string, locationName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const defaultName = `${locationName} - Cópia`;
    setDupLocName(defaultName);
    setDupLocDialog({ locationId, defaultName });
  };

  const handleDupLocConfirm = async () => {
    if (!dupLocDialog || dupLocating) return;
    setDupLocating(true);
    const result = await duplicateLocationAction(dupLocDialog.locationId, budgetId, dupLocName.trim() || dupLocDialog.defaultName);
    setDupLocating(false);
    setDupLocDialog(null);
    if (result.success) await onRefresh();
    else toast.error(result.error || "Erro ao duplicar local");
  };

  return (
    <div className="w-72 shrink-0 flex flex-col border-r bg-card">
      {/* Cabeçalho com azul */}
      <div className="p-3 border-b border-primary/20 shrink-0 bg-primary/[0.04]">
        <h3 className="text-sm font-semibold text-primary">Escopo</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Locais e trechos</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleSectionDragEnd}>
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
                allLocations={localLocations}
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
                  if (e.key === "Escape") { setAddingLocation(false); setNewLocationName(""); }
                }}
                className="h-7 text-xs"
              />
              <div className="flex gap-1">
                <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleAddLocation} disabled={!newLocationName.trim()}>
                  Adicionar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingLocation(false); setNewLocationName(""); }}>
                  ✕
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => setAddingLocation(true)}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar Local
            </Button>
          )}
        </div>
      )}

      {/* Dialog de duplicar local */}
      <Dialog open={!!dupLocDialog} onOpenChange={(open) => { if (!open) setDupLocDialog(null); }}>
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
            <Button variant="outline" type="button" onClick={() => setDupLocDialog(null)}>Cancelar</Button>
            <Button type="button" disabled={!dupLocName.trim() || dupLocating} onClick={handleDupLocConfirm}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DroppableLocationSections ───────────────────────────────────────────────

function DroppableLocationSections({
  locationId,
  isEmpty,
  children,
}: {
  locationId: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: locationId });
  return (
    <div ref={setNodeRef}>
      {children}
      {isOver && isEmpty && (
        <div className="mx-3 my-1 h-0.5 rounded-full bg-primary/50" />
      )}
    </div>
  );
}

// ─── SortableSectionRow ───────────────────────────────────────────────────────

function SortableSectionRow({
  sec,
  locationId,
  allLocations,
  budgetId,
  selected,
  onSelect,
  onDuplicate,
  onDelete,
  onRefresh,
  isReadOnly,
  sectionIndex,
  locationIndex,
  scopeNumber,
}: {
  sec: ScopeSection;
  locationId: string;
  allLocations: ScopeLocation[];
  budgetId: string;
  selected: Selection | null;
  onSelect: (sel: Selection) => void;
  onDuplicate: (sectionId: string, sectionName: string, e: React.MouseEvent) => void;
  onDelete: (sectionId: string, e: React.MouseEvent) => void;
  onRefresh: () => void;
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
      {/* Índice hierárquico: N.X.Y */}
      {scopeNumber && (
        <span className="shrink-0 text-xs font-mono opacity-40">{scopeNumber}.{locationIndex}.{sectionIndex}.</span>
      )}
      <span className="flex-1 truncate text-xs">{sec.name}</span>
      {!isReadOnly && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(sec.id, sec.name, e); }}
            className={cn(
              "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
              isSectionSelected ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-primary"
            )}
            title="Duplicar trecho"
          >
            <Copy className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(sec.id, e); }}
            className={cn(
              "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
              isSectionSelected ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-destructive"
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

// ─── LocationNode ─────────────────────────────────────────────────────────────

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
  onDelete: (e: React.MouseEvent) => void;
  onDuplicate: (e: React.MouseEvent) => void;
  isReadOnly: boolean;
  allLocations: ScopeLocation[];
}

function LocationNode({ location, locIndex, scopeNumber, budgetId, selected, expanded, onToggleExpand, onSelect, onRefresh, onDelete, onDuplicate, isReadOnly, allLocations }: LocationNodeProps) {
  const [addingSection, setAddingSection] = useState(false);
  const [sectionName, setSectionName] = useState("");
  const [duplicateDialog, setDuplicateDialog] = useState<{ sectionId: string; defaultName: string } | null>(null);
  const [duplicateName, setDuplicateName] = useState("");
  const [duplicating, setDuplicating] = useState(false);

  const isSelected = selected?.type === "location" && selected.id === location.id;

  const handleAddSection = async () => {
    const name = sectionName.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
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

  const handleDeleteSection = async (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remover este trecho e seus itens?")) return;
    const result = await deleteSectionAction(sectionId, budgetId);
    if (result.success) await onRefresh();
    else toast.error(result.error || "Erro ao remover trecho");
  };

  const openDuplicateDialog = (sectionId: string, sectionName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const defaultName = `${sectionName} - Cópia`;
    setDuplicateName(defaultName);
    setDuplicateDialog({ sectionId, defaultName });
  };

  const handleDuplicateConfirm = async () => {
    if (!duplicateDialog || duplicating) return;
    setDuplicating(true);
    const result = await duplicateSectionAction(duplicateDialog.sectionId, budgetId, duplicateName.trim() || duplicateDialog.defaultName);
    setDuplicating(false);
    setDuplicateDialog(null);
    if (result.success) await onRefresh();
    else toast.error(result.error || "Erro ao duplicar trecho");
  };

  return (
    <div>
      {/* Local row */}
      <div
        className={cn(
          "group flex items-center gap-1 pr-1 py-1.5 cursor-pointer rounded-sm transition-colors",
          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        )}
        style={{ paddingLeft: "8px" }}
        onClick={() => onSelect({ type: "location", id: location.id })}
      >
        <button
          className="shrink-0 opacity-60 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        >
          {expanded && location.sections.length > 0
            ? <ChevronDown className="h-3.5 w-3.5" />
            : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Map className="h-3.5 w-3.5 shrink-0 opacity-60" />
        {/* Índice hierárquico: N.X onde N é o número do bloco escopo */}
        {scopeNumber && (
          <span className="shrink-0 text-xs font-mono opacity-40">{scopeNumber}.{locIndex}.</span>
        )}
        <span className="flex-1 truncate text-xs font-medium">{location.name}</span>
        {!isReadOnly && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setAddingSection((v) => !v); }}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-all",
                isSelected ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-primary"
              )}
              title="Adicionar trecho"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDuplicate}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                isSelected ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-primary"
              )}
              title="Duplicar local"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={onDelete}
              className={cn(
                "shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-all",
                isSelected ? "text-primary-foreground hover:bg-primary-foreground/20" : "text-muted-foreground hover:text-destructive"
              )}
              title="Excluir local"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Seções do local — droppable + sortable */}
      <DroppableLocationSections locationId={location.id} isEmpty={location.sections.length === 0}>
        {expanded && location.sections.length > 0 && (
          <SortableContext items={location.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            {location.sections.map((sec, secIdx) => (
              <SortableSectionRow
                key={sec.id}
                sec={sec}
                locationId={location.id}
                allLocations={allLocations}
                budgetId={budgetId}
                selected={selected}
                onSelect={onSelect}
                onDuplicate={openDuplicateDialog}
                onDelete={handleDeleteSection}
                onRefresh={onRefresh}
                isReadOnly={isReadOnly}
                sectionIndex={secIdx + 1}
                locationIndex={locIndex}
                scopeNumber={scopeNumber}
              />
            ))}
          </SortableContext>
        )}
      </DroppableLocationSections>

      {/* Adder de trecho */}
      {addingSection && !isReadOnly && (
        <div className="py-1.5 space-y-1" style={{ paddingLeft: "28px", paddingRight: "8px" }}>
          <Input
            autoFocus
            placeholder="Nome do trecho..."
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddSection();
              if (e.key === "Escape") { setAddingSection(false); setSectionName(""); }
            }}
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Button size="sm" className="h-7 flex-1 text-xs" onClick={handleAddSection} disabled={!sectionName.trim()}>OK</Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setAddingSection(false); setSectionName(""); }}>✕</Button>
          </div>
        </div>
      )}

      {/* Dialog de duplicar trecho */}
      <Dialog open={!!duplicateDialog} onOpenChange={(open) => { if (!open) setDuplicateDialog(null); }}>
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
            <Button variant="outline" type="button" onClick={() => setDuplicateDialog(null)}>Cancelar</Button>
            <Button type="button" disabled={!duplicateName.trim() || duplicating} onClick={handleDuplicateConfirm}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── LocationDetail ───────────────────────────────────────────────────────────

interface LocationDetailProps {
  locationId: string;
  location: ScopeLocation | null;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  onSelectSection?: (sectionId: string) => void;
}

function LocationDetail({ locationId, location, budgetId, isReadOnly, onRefresh, onSelectSection }: LocationDetailProps) {
  const [name, setName] = useState(location?.name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [dupDialog, setDupDialog] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dupLocating, setDupLocating] = useState(false);
  const [description, setDescription] = useState(location?.description ?? "");
  const [images, setImages] = useState<BudgetImage[]>([]);
  const [locationItems, setLocationItems] = useState<BudgetItem[]>([]);
  const [addPhotoOpen, setAddPhotoOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getBudgetImagesByLocation(locationId).then((imgs) =>
      setImages(imgs as unknown as BudgetImage[])
    );
  }, [locationId]);

  // Itens de todos os trechos do local — para listagem lateral no anotador de fotos
  useEffect(() => {
    if (!location?.sections?.length) {
      setLocationItems([]);
      return;
    }
    Promise.all(location.sections.map((s) => getItemsBySectionAction(s.id)))
      .then((results) => {
        const all = results.flatMap((r) =>
          r.success && r.data ? (r.data as unknown as BudgetItem[]) : []
        );
        setLocationItems(all);
      });
  }, [location?.id, location?.sections?.length, location?.sections?.map((s) => s.id).join(",")]);

  const commitName = async () => {
    setEditingName(false);
    const trimmed = name.trim().toUpperCase();
    if (!trimmed || trimmed === location?.name) return;
    const result = await updateLocationAction(locationId, budgetId, { name: trimmed });
    if (!result.success) toast.error(result.error || "Erro ao renomear");
    else onRefresh();
  };

  const handleDescChange = useCallback((html: string) => {
    setDescription(html);
    if (descDebounce.current) clearTimeout(descDebounce.current);
    descDebounce.current = setTimeout(async () => {
      await updateLocationAction(locationId, budgetId, { description: html });
    }, 1500);
  }, [locationId, budgetId]);

  const handleDeleteImage = async (image: BudgetImage) => {
    await deleteBudgetImage(image.id, budgetId);
    setImages((prev) => prev.filter((img) => img.id !== image.id));
  };

  if (!location) return null;

  return (
    // LocationDetail: card com fundo azulado e header com borda azul
    <div className="space-y-6 bg-primary/[0.03] rounded-lg p-5 border border-primary/20 shadow-sm">
      {/* Título com underline azul */}
      <div className="flex items-center gap-2 pb-3 border-b-2 border-primary/50">
        <Map className="h-5 w-5 text-primary shrink-0" />
        {editingName && !isReadOnly ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setName(location.name); setEditingName(false); }
            }}
            className="text-xl font-bold border-b border-primary outline-none bg-transparent flex-1"
          />
        ) : (
          <button
            type="button"
            className={cn("group flex items-center gap-1.5 flex-1 text-left", !isReadOnly && "hover:text-primary transition-colors")}
            onClick={() => { if (!isReadOnly) { setName(location.name); setEditingName(true); } }}
            title={!isReadOnly ? "Clique para editar" : undefined}
            disabled={isReadOnly}
          >
            <h2 className="text-xl font-bold">{location.name}</h2>
            {!isReadOnly && (
              <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
            )}
          </button>
        )}
        {!isReadOnly && (
          <>
            <button
              title="Duplicar local"
              onClick={() => { setDupName(`${location.name} - Cópia`); setDupDialog(true); }}
              className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              title="Excluir local"
              onClick={async () => {
                if (!confirm("Remover este local e todos os seus trechos?")) return;
                const result = await deleteLocationAction(locationId, budgetId);
                if (result.success) onRefresh();
                else toast.error(result.error || "Erro ao remover local");
              }}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Dialog de duplicar local */}
      <Dialog open={dupDialog} onOpenChange={(open) => { if (!open) setDupDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar local</DialogTitle>
            <DialogDescription>Informe o nome para o novo local.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (dupLocating) return;
                  setDupLocating(true);
                  setDupDialog(false);
                  const result = await duplicateLocationAction(locationId, budgetId, dupName.trim());
                  setDupLocating(false);
                  if (result.success) onRefresh();
                  else toast.error(result.error || "Erro ao duplicar local");
                }
              }}
              placeholder="Nome do local"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDupDialog(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={!dupName.trim() || dupLocating}
              onClick={async () => {
                if (dupLocating) return;
                setDupLocating(true);
                setDupDialog(false);
                const result = await duplicateLocationAction(locationId, budgetId, dupName.trim());
                setDupLocating(false);
                if (result.success) onRefresh();
                else toast.error(result.error || "Erro ao duplicar local");
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fotos */}
      <CollapsibleEditorSection label="Fotos do local">
        <BudgetImageGallery
          images={images}
          onAdd={() => { if (!isReadOnly) setAddPhotoOpen(true); }}
          onEdit={(img) => setEditingImage(img)}
          onDelete={handleDeleteImage}
          emptyMessage="Nenhuma foto."
        />
      </CollapsibleEditorSection>

      {/* Descrição */}
      <CollapsibleEditorSection label="Descrição do local">
        <CompositorRichTextEditor
          key={locationId}
          value={description}
          onChange={handleDescChange}
          placeholder="Descreva o local..."
        />
      </CollapsibleEditorSection>

      {/* Trechos — clicáveis para navegar */}
      {location.sections.length > 0 && (
        <CollapsibleEditorSection label={`Trechos (${location.sections.length})`} defaultOpen>
          <div className="space-y-1.5">
            {location.sections.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => onSelectSection?.(sec.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-md border border-border bg-white hover:bg-primary/[0.04] hover:border-primary/30 text-sm transition-colors group text-left"
              >
                <Layers className="h-4 w-4 text-primary/50 shrink-0 group-hover:text-primary transition-colors" />
                <span className="flex-1 font-medium">{sec.name}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
              </button>
            ))}
          </div>
        </CollapsibleEditorSection>
      )}

      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId}
        locationId={locationId}
        availableItems={locationItems}
        open={addPhotoOpen}
        onOpenChange={setAddPhotoOpen}
        onSaved={() => {
          setAddPhotoOpen(false);
          getBudgetImagesByLocation(locationId).then((imgs) => setImages(imgs as unknown as BudgetImage[]));
        }}
      />
      {editingImage && (
        <BudgetPhotoAnnotatorDialog
          budgetId={budgetId}
          locationId={locationId}
          imageId={editingImage.id}
          availableItems={locationItems}
          initialImageUrl={toAbsoluteImageUrl(editingImage.url || editingImage.composed_url) ?? null}
          initialAnnotations={(editingImage.annotations ?? []) as unknown as Parameters<typeof BudgetPhotoAnnotatorDialog>[0]["initialAnnotations"]}
          open={!!editingImage}
          onOpenChange={(open) => { if (!open) setEditingImage(null); }}
          onSaved={() => {
            setEditingImage(null);
            getBudgetImagesByLocation(locationId).then((imgs) => setImages(imgs as unknown as BudgetImage[]));
          }}
        />
      )}
    </div>
  );
}

// ─── SectionDetail ────────────────────────────────────────────────────────────

interface SectionDetailProps {
  sectionId: string;
  locationId: string;
  section: ScopeSection | null;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  locations?: ScopeLocation[];
}

function SectionDetail({ sectionId, locationId, section, budgetId, isReadOnly, onRefresh, locations = [] }: SectionDetailProps) {
  const [name, setName] = useState(section?.name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [description, setDescription] = useState(section?.description ?? "");
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [images, setImages] = useState<BudgetImage[]>([]);
  const [addPhotoOpen, setAddPhotoOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
  const [dupDialog, setDupDialog] = useState(false);
  const [dupName, setDupName] = useState("");
  const [dupSectioning, setDupSectioning] = useState(false);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDescRef = useRef<string | null>(null);

  // Sincroniza descrição quando troca de trecho
  useEffect(() => {
    setDescription(section?.description ?? "");
    pendingDescRef.current = null;
    if (descDebounce.current) clearTimeout(descDebounce.current);
  }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush de segurança: salva conteúdo pendente ao desmontar ou trocar de trecho.
  // Após salvar, chama onRefresh para que locations fique sincronizado ao voltar.
  useEffect(() => {
    return () => {
      if (descDebounce.current) clearTimeout(descDebounce.current);
      if (pendingDescRef.current !== null) {
        const html = pendingDescRef.current;
        updateSectionAction(sectionId, budgetId, { description: html }).then((res) => {
          if (res?.success) onRefresh();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  const loadItems = useCallback(async () => {
    const result = await getItemsBySectionAction(sectionId);
    if (result.success && result.data) {
      setItems(result.data as unknown as BudgetItem[]);
    }
  }, [sectionId]);

  useEffect(() => {
    loadItems();
    getBudgetImagesBySection(sectionId).then((imgs) =>
      setImages(imgs as unknown as BudgetImage[])
    );
  }, [sectionId, loadItems]);

  useEffect(() => {
    listProductGroupsAction().then((res) => {
      if (res.success && res.data) setGroups(res.data);
    });
  }, []);

  const commitName = async () => {
    setEditingName(false);
    const trimmed = name.trim().replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    if (!trimmed || trimmed === section?.name) return;
    const result = await updateSectionAction(sectionId, budgetId, { name: trimmed });
    if (!result.success) toast.error(result.error || "Erro ao renomear");
    else onRefresh();
  };

  const handleDescChange = useCallback((html: string) => {
    setDescription(html);
    pendingDescRef.current = html;
    if (descDebounce.current) clearTimeout(descDebounce.current);
    descDebounce.current = setTimeout(async () => {
      const result = await updateSectionAction(sectionId, budgetId, { description: html });
      if (result.success) {
        pendingDescRef.current = null;
        onRefresh();
      } else {
        toast.error(result.error || "Erro ao salvar descrição");
      }
    }, 1500);
  }, [sectionId, budgetId, onRefresh]);

  const handleDeleteImage = async (image: BudgetImage) => {
    await deleteBudgetImage(image.id, budgetId);
    setImages((prev) => prev.filter((img) => img.id !== image.id));
  };

  const total = items.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

  if (!section) return null;

  return (
    // SectionDetail: card com border-l-4 azul como no compositor
    <div className="space-y-6 bg-white rounded-md shadow-sm border-l-4 border-l-primary/40 p-5 border border-border">
      {/* Título com underline */}
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <Layers className="h-5 w-5 text-primary shrink-0" />
        {editingName && !isReadOnly ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setName(section.name); setEditingName(false); }
            }}
            className="text-xl font-bold border-b border-primary outline-none bg-transparent flex-1"
          />
        ) : (
          <button
            type="button"
            className={cn("group flex items-center gap-1.5 flex-1 text-left", !isReadOnly && "hover:text-primary transition-colors")}
            onClick={() => { if (!isReadOnly) { setName(section.name); setEditingName(true); } }}
            title={!isReadOnly ? "Clique para editar" : undefined}
            disabled={isReadOnly}
          >
            <h2 className="text-xl font-bold">{section.name}</h2>
            {!isReadOnly && (
              <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
            )}
          </button>
        )}
        {!isReadOnly && (
          <>
            <button
              title="Duplicar trecho"
              onClick={() => { setDupName(`${section.name} - Cópia`); setDupDialog(true); }}
              className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              title="Excluir trecho"
              onClick={async () => {
                if (!confirm("Remover este trecho e seus itens?")) return;
                const result = await deleteSectionAction(sectionId, budgetId);
                if (result.success) onRefresh();
                else toast.error(result.error || "Erro ao remover trecho");
              }}
              className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* Dialog de duplicar trecho */}
      <Dialog open={dupDialog} onOpenChange={(open) => { if (!open) setDupDialog(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar trecho</DialogTitle>
            <DialogDescription>Informe o nome para o novo trecho.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={dupName}
              onChange={(e) => setDupName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (dupSectioning) return;
                  setDupSectioning(true);
                  setDupDialog(false);
                  const result = await duplicateSectionAction(sectionId, budgetId, dupName.trim());
                  setDupSectioning(false);
                  if (result.success) onRefresh();
                  else toast.error(result.error || "Erro ao duplicar trecho");
                }
              }}
              placeholder="Nome do trecho"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDupDialog(false)}>Cancelar</Button>
            <Button
              type="button"
              disabled={!dupName.trim() || dupSectioning}
              onClick={async () => {
                if (dupSectioning) return;
                setDupSectioning(true);
                setDupDialog(false);
                const result = await duplicateSectionAction(sectionId, budgetId, dupName.trim());
                setDupSectioning(false);
                if (result.success) onRefresh();
                else toast.error(result.error || "Erro ao duplicar trecho");
              }}
            >
              <Copy className="h-4 w-4 mr-2" />
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fotos */}
      <CollapsibleEditorSection label="Fotos do trecho">
        <BudgetImageGallery
          images={images}
          onAdd={() => { if (!isReadOnly) setAddPhotoOpen(true); }}
          onEdit={(img) => setEditingImage(img)}
          onDelete={handleDeleteImage}
          emptyMessage="Nenhuma foto."
        />
      </CollapsibleEditorSection>

      {/* Produtos */}
      <CollapsibleEditorSection
        label="Produtos"
        rightContent={items.length > 0 ? formatCurrency(total) : undefined}
      >
        {items.length > 0 && (
          <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
            <div className="col-span-3">Produto</div>
            <div className="col-span-2 text-center">Qtd</div>
            <div className="col-span-2 text-right">Equipto.</div>
            <div className="col-span-2 text-right">MO unit.</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-2" />
          </div>
        )}
        <SortableItemsList
          items={items}
          budgetId={budgetId}
          isReadOnly={isReadOnly}
          onRefresh={loadItems}
          groups={groups}
        />
        {!isReadOnly && (
          <div className="mt-2 space-y-2">
            <ScopeItemCreator sectionId={sectionId} budgetId={budgetId} onSuccess={loadItems} />
            <ScopeGroupAdder sectionId={sectionId} budgetId={budgetId} onSuccess={loadItems} />
          </div>
        )}
      </CollapsibleEditorSection>

      {/* Descrição */}
      <CollapsibleEditorSection label="Descrição do trecho">
        <CompositorRichTextEditor
          key={sectionId}
          value={description}
          onChange={handleDescChange}
          placeholder="Descreva o trecho..."
        />
      </CollapsibleEditorSection>

      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId}
        sectionId={sectionId}
        availableItems={items}
        open={addPhotoOpen}
        onOpenChange={setAddPhotoOpen}
        onSaved={() => {
          setAddPhotoOpen(false);
          getBudgetImagesBySection(sectionId).then((imgs) => setImages(imgs as unknown as BudgetImage[]));
        }}
      />
      {editingImage && (
        <BudgetPhotoAnnotatorDialog
          budgetId={budgetId}
          sectionId={sectionId}
          imageId={editingImage.id}
          availableItems={items}
          initialImageUrl={toAbsoluteImageUrl(editingImage.url || editingImage.composed_url) ?? null}
          initialAnnotations={(editingImage.annotations ?? []) as unknown as Parameters<typeof BudgetPhotoAnnotatorDialog>[0]["initialAnnotations"]}
          open={!!editingImage}
          onOpenChange={(open) => { if (!open) setEditingImage(null); }}
          onSaved={() => {
            setEditingImage(null);
            getBudgetImagesBySection(sectionId).then((imgs) => setImages(imgs as unknown as BudgetImage[]));
          }}
        />
      )}
    </div>
  );
}

// ─── ScopeItemRow ─────────────────────────────────────────────────────────────

function ScopeItemRow({
  item,
  budgetId,
  isReadOnly,
  onRefresh,
  indented = false,
  dragHandleProps,
  groups = [],
}: {
  item: BudgetItem;
  budgetId: string;
  isReadOnly: boolean;
  onRefresh: () => void;
  indented?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  groups?: ProductGroup[];
}) {
  const [qty, setQty] = useState(item.quantity);
  const [groupSaving, setGroupSaving] = useState(false);
  const qtyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQty(item.quantity);
  }, [item.quantity]);

  const productData = (item as unknown as Record<string, unknown>).product_data as Record<string, unknown> | undefined;
  const productIdObj = (item as Record<string, unknown>).product_id;
  const productFallback = typeof productIdObj === "object" && productIdObj !== null ? productIdObj as Record<string, unknown> : undefined;
  const productName = ((item as Record<string, unknown>).product_name as string | undefined)
    ?? (productData?.description ?? productData?.name ?? productData?.code ?? productFallback?.description ?? productFallback?.name ?? productFallback?.code) as string | undefined;
  const unitPrice = Number(item.unit_price) || 0;
  const laborCost = Number(item.labor_cost) || 0;
  const total = (unitPrice + laborCost) * qty;

  const currentGroupId = (item as Record<string, unknown>).group_id as string | undefined;
  const selectValue = currentGroupId ?? NO_GROUP_VALUE;

  const handleQtyChange = (val: number) => {
    if (val < 1) return;
    setQty(val);
    if (qtyDebounce.current) clearTimeout(qtyDebounce.current);
    qtyDebounce.current = setTimeout(() => {
      updateItemQuantityAction(item.id!, budgetId, val).then(onRefresh);
    }, 600);
  };

  const handleGroupChange = async (value: string) => {
    const newGroupId = value === NO_GROUP_VALUE ? null : value;
    const newGroupName = newGroupId ? (groups.find((g) => g.id === newGroupId)?.name ?? "") : undefined;
    setGroupSaving(true);
    const result = await updateItemGroupInSectionAction(item.id!, budgetId, newGroupId, newGroupName);
    setGroupSaving(false);
    if (!result.success) toast.error(result.error ?? "Erro ao atualizar grupo");
    else onRefresh();
  };

  const handleDelete = async () => {
    const result = await deleteItemAction(item.id!, budgetId);
    if (!result.success) toast.error(result.error || "Erro ao remover");
    else onRefresh();
  };

  return (
    <div className={cn("grid grid-cols-12 gap-2 items-center px-2 py-1.5 rounded-md border bg-background text-sm", indented && "ml-4")}>
      <div className="col-span-3 flex items-center gap-1 min-w-0">
        {dragHandleProps && (
          <button
            type="button"
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0 touch-none"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span className="truncate text-xs">{productName || "Produto"}</span>
      </div>
      <div className="col-span-2 flex justify-center">
        {isReadOnly ? (
          <span className="text-xs">{qty}</span>
        ) : (
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => handleQtyChange(Number(e.target.value))}
            className="w-12 text-center border rounded text-xs h-6"
          />
        )}
      </div>
      <div className="col-span-2 text-right text-xs text-muted-foreground">{formatCurrency(unitPrice)}</div>
      <div className="col-span-2 text-right text-xs text-muted-foreground">{formatCurrency(laborCost)}</div>
      <div className="col-span-1 text-right text-xs font-medium">{formatCurrency(total)}</div>
      <div className="col-span-2 flex items-center justify-end gap-1">
        {!isReadOnly && groups.length > 0 && (
          <Select
            value={selectValue}
            onValueChange={handleGroupChange}
            disabled={groupSaving}
          >
            <SelectTrigger className="h-7 w-[7rem] text-xs border-dashed">
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_GROUP_VALUE}>Sem grupo</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!isReadOnly && (
          <button onClick={handleDelete} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── ScopeItemCreator ────────────────────────────────────────────────────────

function ScopeItemCreator({
  sectionId,
  budgetId,
  onSuccess,
}: {
  sectionId: string;
  budgetId: string;
  onSuccess: () => void;
}) {
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    if (!selected) { toast.error("Selecione um produto"); return; }
    setLoading(true);
    const result = await addItemAction(sectionId, budgetId, selected.id!, qty);
    setLoading(false);
    if (result.success) {
      setSelected(null);
      setQty(1);
      onSuccess();
    } else {
      toast.error(result.error || "Erro ao adicionar produto");
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/30">
      <div className="flex-1">
        <ProductSelector
          selectedProduct={selected}
          onSelect={(_id, product) => { if (product) setSelected(product); }}
        />
      </div>
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
        className="w-16 text-center border rounded text-xs h-8"
        disabled={!selected}
      />
      <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!selected || loading}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

// ─── ScopeGroupAdder ─────────────────────────────────────────────────────────

function ScopeGroupAdder({
  sectionId,
  budgetId,
  onSuccess,
}: {
  sectionId: string;
  budgetId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-xs gap-1.5"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar Grupo de Produtos
      </Button>
      <AddGroupDialog
        open={open}
        onOpenChange={setOpen}
        sectionId={sectionId}
        budgetId={budgetId}
        onSuccess={onSuccess}
        addGroupToSection={addGroupToSectionAction}
      />
    </>
  );
}
