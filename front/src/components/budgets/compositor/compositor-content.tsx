"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { MapPin, Layers, FileText, FolderOpen, Plus, Trash2, GripVertical, Map, ArrowRight } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableTitle } from "@/components/budgets/editor/editable-title";
import { CompositorRichTextEditor, CollapsibleEditorSection } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { CompositorItemCreator } from "@/components/budgets/compositor/compositor-item-creator";
import { AddGroupDialog } from "@/components/budgets/editor/add-group-dialog";
import { BudgetImageGallery } from "@/components/budgets/budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "@/components/budgets/budget-photo-annotator-dialog";
import { toast } from "@/lib/toast";
import {
  updateBlockAction,
  addGroupToBlockAction,
  deleteItemFromBlockAction,
  updateItemQuantityInBlockAction,
  updateItemGroupInBlockAction,
  reorderItemsInBlockAction,
} from "@/actions/budget-compositor-actions";
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import { deleteBudgetImage } from "@/actions/budget-annotations";
import { getScopeStatsAction } from "@/actions/budget-scope-actions";
import { useWorkspaceTab } from "@/components/budgets/workspace-context";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { BudgetItem, BudgetImage } from "@/types/budget-types";
import { toAbsoluteImageUrl } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatCurrency = (val: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

// Normaliza casing: sessão raiz → UPPERCASE, subsessões/locais → Title Case
function normalizeLabel(label: string, block: BudgetBlock): string {
  const isRootSession = block.type === "session" && block.depth === 0;
  if (isRootSession) return label.toUpperCase();
  if (block.type === "session" || block.type === "location") {
    // CamelCase: primeira letra de cada palavra maiúscula
    return label.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  }
  return label;
}

function useBlockLabel(block: BudgetBlock, budgetId: string, onRefresh: () => void) {
  return useCallback(async (newLabel: string) => {
    const normalized = normalizeLabel(newLabel.trim(), block);
    const result = await updateBlockAction(block.id, budgetId, { label: normalized });
    if (!result.success) toast.error(result.error || "Erro ao renomear");
    else onRefresh();
  }, [block.id, block.type, block.depth, budgetId, onRefresh]); // eslint-disable-line react-hooks/exhaustive-deps
}


// ─── useBlockDescription (com debounce) ──────────────────────────────────────

function useBlockDescription(block: BudgetBlock, budgetId: string, onRefresh: () => void) {
  const [description, setDescription] = useState((block.props.description as string) || "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    setDescription((block.props.description as string) || "");
    pendingRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, [block.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (pendingRef.current !== null) {
        updateBlockAction(block.id, budgetId, { props: { description: pendingRef.current } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const handleChange = useCallback((html: string) => {
    setDescription(html);
    pendingRef.current = html;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      await updateBlockAction(block.id, budgetId, { props: { description: html } });
      pendingRef.current = null;
      onRefresh();
    }, 1500);
  }, [block.id, budgetId, onRefresh]);

  return { description, handleChange };
}

// Referência estável para listas de itens vazias, evitando loop de re-render
// no padrão "setState durante render" do SectionRenderer.
const EMPTY_ITEMS: BudgetItem[] = [];

// ─── buildItemSegments ────────────────────────────────────────────────────────

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
        const gname = (item as Record<string, unknown>).group_name as string ?? gid;
        segments.push({ type: "group", id: gid, name: gname, items: [item] });
      }
    }
  }
  return segments;
}

// ─── ItemRow ──────────────────────────────────────────────────────────────────

const NO_GROUP_VALUE = "__none__";

function ItemRow({
  item,
  budgetId,
  onDelete,
  onRefresh,
  indented,
  isReadOnly,
  groups = [],
}: {
  item: BudgetItem;
  budgetId: string;
  onDelete: (id: string) => void;
  onRefresh: () => void;
  indented?: boolean;
  isReadOnly?: boolean;
  groups?: ProductGroup[];
}) {
  const [qty, setQty] = useState(item.quantity);
  const [saving, setSaving] = useState(false);
  const [groupSaving, setGroupSaving] = useState(false);

  const [prevQty, setPrevQty] = useState(item.quantity);
  if (prevQty !== item.quantity) {
    setPrevQty(item.quantity);
    setQty(item.quantity);
  }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id! });

  const handleQtyCommit = async () => {
    if (qty === item.quantity || qty < 1) return;
    setSaving(true);
    const result = await updateItemQuantityInBlockAction(item.id!, budgetId, qty);
    setSaving(false);
    if (!result.success) {
      toast.error(result.error || "Erro ao atualizar quantidade");
      setQty(item.quantity);
    } else {
      onRefresh();
    }
  };

  const currentGroupId = (item as Record<string, unknown>).group_id as string | undefined;
  const currentGroupName = (item as Record<string, unknown>).group_name as string | undefined;
  const selectValue = currentGroupId ?? NO_GROUP_VALUE;

  const handleGroupChange = async (value: string) => {
    const newGroupId = value === NO_GROUP_VALUE ? null : value;
    const newGroupName = newGroupId ? (groups.find((g) => g.id === newGroupId)?.name ?? "") : undefined;
    setGroupSaving(true);
    const result = await updateItemGroupInBlockAction(item.id!, budgetId, newGroupId, newGroupName);
    setGroupSaving(false);
    if (!result.success) toast.error(result.error ?? "Erro ao atualizar grupo");
    else onRefresh();
  };

  const unit = typeof item.product_id === "object" ? (item.product_id as Record<string, unknown>).unit as string : "";
  const name = typeof item.product_id === "object"
    ? ((item.product_id as Record<string, unknown>).description as string) ?? "Produto"
    : "Produto";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`grid grid-cols-12 gap-2 items-center p-2 bg-white rounded-md border text-sm hover:shadow-sm transition-shadow ${indented ? "ml-4" : ""} ${isDragging ? "opacity-50 shadow-lg" : ""}`}
    >
      <div className="col-span-1 flex items-center justify-center">
        {!isReadOnly && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground p-0.5 touch-none"
            aria-label="Arrastar para reordenar"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="col-span-11 md:col-span-4 font-medium truncate">{name}</div>
      <div className="col-span-4 md:col-span-2 flex items-center justify-center gap-1">
        <input
          type="number"
          min={1}
          value={qty}
          disabled={saving || isReadOnly}
          onChange={(e) => !isReadOnly && setQty(Math.max(1, Number(e.target.value)))}
          onBlur={() => !isReadOnly && handleQtyCommit()}
          onKeyDown={(e) => { if (!isReadOnly && e.key === "Enter") e.currentTarget.blur(); }}
          className="w-14 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
      <div className="hidden md:block md:col-span-2 text-right text-muted-foreground text-xs">{formatCurrency(item.labor_cost ?? 0)}</div>
      <div className="hidden md:block md:col-span-1 text-right text-muted-foreground text-xs">{formatCurrency(item.unit_price)}</div>
      <div className="col-span-4 md:col-span-1 text-right font-semibold">{formatCurrency(item.total)}</div>
      <div className="col-span-4 md:col-span-1 flex items-center justify-end gap-1">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(item.id!)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Renderers de bloco (modo documento) ──────────────────────────────────────
// Cada renderer recebe o bloco e renderiza APENAS seu próprio conteúdo.
// Os filhos são renderizados pelo BlockDocument de forma recursiva.

interface RendererProps {
  block: BudgetBlock;
  budgetId: string;
  items: Record<string, BudgetItem[]>;
  imagesByBlock: Record<string, BudgetImage[]>;
  onRefresh: () => void;
  isReadOnly?: boolean;
}

// Sessão — cabeçalho + descrição opcional; filhos são renderizados pelo loop pai
function SessionRenderer({ block, budgetId, onRefresh }: RendererProps) {
  const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
  const { description, handleChange } = useBlockDescription(block, budgetId, onRefresh);
  const isRoot = block.depth === 0;

  // Session: card com borda azul à esquerda (igual aos demais blocos)
  return (
    <div className={`space-y-3 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40 ${isRoot ? "mb-1" : "mb-4"}`}>
      <div className={`flex items-baseline gap-3 pb-2 mb-2 ${isRoot ? "border-b-2 border-primary" : "border-b border-primary/50"}`}>
        {block.number && (
          <span className={`shrink-0 font-mono font-bold text-primary ${isRoot ? "text-2xl" : "text-xl"}`}>
            {block.number}.
          </span>
        )}
        <EditableTitle
          value={block.label || "Sessão"}
          onSave={handleSaveLabel}
          className={isRoot ? "text-2xl font-bold text-foreground uppercase" : "text-xl font-semibold text-foreground capitalize"}
        />
      </div>
      <CollapsibleEditorSection label="Descrição">
        <CompositorRichTextEditor
          key={block.id}
          value={description}
          onChange={handleChange}
          placeholder="Descrição da sessão..."
        />
      </CollapsibleEditorSection>
    </div>
  );
}

// Local — título + descrição + galeria; trechos aparecem abaixo via recursão
function LocationRenderer({ block, budgetId, imagesByBlock, onRefresh }: RendererProps) {
  const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
  const { description, handleChange } = useBlockDescription(block, budgetId, onRefresh);
  const images = imagesByBlock[block.id] ?? [];
  const [addPhotoOpen, setAddPhotoOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);

  const handleDeleteImage = async (image: BudgetImage) => {
    const result = await deleteBudgetImage(image.id, budgetId);
    if (!result.success) toast.error(result.error || "Erro ao excluir foto");
    else onRefresh();
  };

  return (
    // Local: card com borda azul à esquerda (igual aos demais blocos)
    <div className="space-y-4 bg-primary/[0.03] rounded-lg p-4 border-l-4 border-l-primary/40 border border-primary/20 shadow-sm">
      <div className="flex items-baseline gap-3 pb-2 border-b-2 border-primary/50 mb-2">
        {block.number && (
          <span className="shrink-0 font-mono font-semibold text-lg text-primary">{block.number}.</span>
        )}
        <EditableTitle
          value={block.label || "Local"}
          onSave={handleSaveLabel}
          className="text-lg font-semibold text-foreground"
        />
      </div>

      <CollapsibleEditorSection label="Descrição">
        <CompositorRichTextEditor key={block.id} value={description} onChange={handleChange} placeholder="Descreva o local..." galleryImages={images} />
      </CollapsibleEditorSection>

      <CollapsibleEditorSection label="Fotos do local">
        <BudgetImageGallery
          images={images}
          onAdd={() => setAddPhotoOpen(true)}
          onEdit={(img) => setEditingImage(img)}
          onDelete={handleDeleteImage}
          emptyMessage="Nenhuma foto. Clique em Adicionar Foto para começar."
        />
      </CollapsibleEditorSection>

      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId} blockId={block.id}
        open={addPhotoOpen} onOpenChange={setAddPhotoOpen}
        onSaved={() => { setAddPhotoOpen(false); onRefresh(); }}
      />
      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId} blockId={block.id}
        imageId={editingImage?.id}
        initialImageUrl={(editingImage?.url || editingImage?.composed_url) ? toAbsoluteImageUrl(editingImage!.url || editingImage!.composed_url) : null}
        initialAnnotations={(editingImage?.annotations ?? []) as unknown as Parameters<typeof BudgetPhotoAnnotatorDialog>[0]["initialAnnotations"]}
        open={!!editingImage} onOpenChange={(open) => { if (!open) setEditingImage(null); }}
        onSaved={() => { setEditingImage(null); onRefresh(); }}
      />
    </div>
  );
}

// Trecho — conteúdo completo: descrição + produtos + galeria
function SectionRenderer({ block, budgetId, items, imagesByBlock, onRefresh, isReadOnly }: RendererProps) {
  const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
  const { description, handleChange } = useBlockDescription(block, budgetId, onRefresh);
  const images = imagesByBlock[block.id] ?? [];
  const [addPhotoOpen, setAddPhotoOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
  const [localItems, setLocalItems] = useState<BudgetItem[]>(items[block.id] ?? EMPTY_ITEMS);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);

  useEffect(() => {
    listProductGroupsAction().then((res) => {
      if (res.success && res.data) setGroups(res.data);
    });
  }, []);

  // Sync local items when server data changes
  // IMPORTANTE: usa EMPTY_ITEMS (referência estável) como fallback — nunca `|| []`,
  // pois `|| []` cria um novo array a cada render e causa loop infinito de setState.
  const serverItems = items[block.id] ?? EMPTY_ITEMS;
  const [prevServerItems, setPrevServerItems] = useState(serverItems);
  if (prevServerItems !== serverItems) {
    setPrevServerItems(serverItems);
    setLocalItems(serverItems);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDeleteImage = async (image: BudgetImage) => {
    const result = await deleteBudgetImage(image.id, budgetId);
    if (!result.success) toast.error(result.error || "Erro ao excluir foto");
    else onRefresh();
  };

  const handleDeleteItem = async (itemId: string) => {
    const result = await deleteItemFromBlockAction(itemId, budgetId);
    if (!result.success) toast.error(result.error || "Erro ao remover item");
    else onRefresh();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localItems.findIndex((i) => i.id === active.id);
    const newIndex = localItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localItems, oldIndex, newIndex);
    setLocalItems(reordered); // optimistic update

    const itemIds = reordered.map((i) => i.id!);
    const result = await reorderItemsInBlockAction(block.id, itemIds);
    if (!result.success) {
      toast.error(result.error || "Erro ao reordenar itens");
      setLocalItems(localItems); // rollback
    }
  };

  const addGroupToSection = async (
    _sectionId: string, _budgetId: string,
    groupId: string, groupName: string,
    productQuantities: Record<string, number>, selectedProductIds: string[]
  ) => addGroupToBlockAction(block.id, budgetId, groupId, groupName, productQuantities, selectedProductIds);

  const total = localItems.reduce((sum, i) => sum + (i.total || 0), 0);
  const segments = buildItemSegments(localItems);

  return (
    <div className="space-y-4 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40 mb-4">
      <div className="flex items-baseline gap-3 border-b border-border pb-2">
        {block.number && (
          <span className="shrink-0 font-mono font-semibold text-base text-primary">{block.number}.</span>
        )}
        <EditableTitle
          value={block.label || "Trecho"}
          onSave={handleSaveLabel}
          className="text-base font-semibold text-foreground"
        />
      </div>

      <CollapsibleEditorSection label="Observações do trecho">
        <CompositorRichTextEditor key={block.id} value={description} onChange={handleChange} placeholder="Observações, especificações técnicas..." galleryImages={images} />
      </CollapsibleEditorSection>

      {/* Produtos */}
      <CollapsibleEditorSection
        label="Produtos"
        rightContent={localItems.length > 0 ? `Total: ${formatCurrency(total)}` : undefined}
      >
        {localItems.length > 0 && (
          <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
            <div className="col-span-1" />
            <div className="col-span-4">Produto</div>
            <div className="col-span-2 text-center">Qtd</div>
            <div className="hidden md:block md:col-span-2 text-right">MO unit.</div>
            <div className="hidden md:block md:col-span-1 text-right">Equipto.</div>
            <div className="col-span-2 md:col-span-1 text-right">Total</div>
          </div>
        )}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map((i) => i.id!)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {segments.map((seg) =>
                seg.type === "standalone" ? (
                  <ItemRow
                    key={seg.item.id}
                    item={seg.item}
                    budgetId={budgetId}
                    onDelete={handleDeleteItem}
                    onRefresh={onRefresh}
                    isReadOnly={isReadOnly}
                    groups={groups}
                  />
                ) : (
                  <div key={seg.id}>
                    <div className="flex items-center gap-2 mt-2 mb-1 px-1">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0">
                        {seg.name}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    {seg.items.map((item) => (
                      <div key={item.id} className="mb-1">
                        <ItemRow
                          item={item}
                          budgetId={budgetId}
                          onDelete={handleDeleteItem}
                          onRefresh={onRefresh}
                          indented
                          isReadOnly={isReadOnly}
                          groups={groups}
                        />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </SortableContext>
        </DndContext>
        {!isReadOnly && (
          <div className="mt-2">
            <CompositorItemCreator blockId={block.id} budgetId={budgetId} onSuccess={onRefresh} />
          </div>
        )}
      </CollapsibleEditorSection>

      {!isReadOnly && (
        <>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5"
            onClick={() => setIsAddGroupDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar Grupo de Produtos
          </Button>
          <AddGroupDialog
            open={isAddGroupDialogOpen}
            onOpenChange={setIsAddGroupDialogOpen}
            sectionId={block.id}
            budgetId={budgetId}
            onSuccess={onRefresh}
            addGroupToSection={addGroupToSection}
          />
        </>
      )}

      {/* Galeria */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Fotos do trecho</p>
        <BudgetImageGallery
          images={images}
          onAdd={() => setAddPhotoOpen(true)}
          onEdit={(img) => setEditingImage(img)}
          onDelete={handleDeleteImage}
          emptyMessage="Nenhuma foto. Clique em Adicionar Foto para começar."
        />
      </div>

      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId} blockId={block.id}
        availableItems={localItems}
        open={addPhotoOpen} onOpenChange={setAddPhotoOpen}
        onSaved={() => { setAddPhotoOpen(false); onRefresh(); }}
      />
      <BudgetPhotoAnnotatorDialog
        budgetId={budgetId} blockId={block.id}
        imageId={editingImage?.id}
        availableItems={localItems}
        initialImageUrl={(editingImage?.url || editingImage?.composed_url) ? toAbsoluteImageUrl(editingImage!.url || editingImage!.composed_url) : null}
        initialAnnotations={(editingImage?.annotations ?? []) as unknown as Parameters<typeof BudgetPhotoAnnotatorDialog>[0]["initialAnnotations"]}
        open={!!editingImage} onOpenChange={(open) => { if (!open) setEditingImage(null); }}
        onSaved={() => { setEditingImage(null); onRefresh(); }}
      />
    </div>
  );
}

// Texto livre
function TextRenderer({ block, budgetId, onRefresh }: RendererProps) {
  const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
  const { description, handleChange } = useBlockDescription(block, budgetId, onRefresh);
  return (
    <div className="space-y-2 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40">
      <div className="flex items-baseline gap-3">
        {block.number && (
          <span className="shrink-0 font-mono font-semibold text-sm text-primary">{block.number}.</span>
        )}
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <EditableTitle
            value={block.label || "Texto livre"}
            onSave={handleSaveLabel}
            className="text-sm font-medium text-muted-foreground"
          />
        </div>
      </div>
      <CollapsibleEditorSection label="Texto">
        <CompositorRichTextEditor key={block.id} value={description} onChange={handleChange} placeholder="Digite o conteúdo aqui..." />
      </CollapsibleEditorSection>
    </div>
  );
}

// ─── ScopeRenderer ────────────────────────────────────────────────────────────

function ScopeRenderer({ block, budgetId }: RendererProps) {
  const [stats, setStats] = useState<{ locations: number; sections: number; items: number } | null>(null);
  const { setActiveTab } = useWorkspaceTab();

  useEffect(() => {
    getScopeStatsAction(budgetId).then((r) => {
      if (r.success && r.data) setStats(r.data);
    });
  }, [budgetId]);

  return (
    <div id={`block-${block.id}`} className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Map className="h-5 w-5 text-primary" />
        <span className="font-bold text-sm text-primary uppercase tracking-wide">ESCOPO</span>
      </div>
      <p className="text-sm text-muted-foreground">
        Este bloco expande o conteúdo configurado na aba Escopo
        {stats ? (
          <span>: <strong>{stats.locations}</strong> {stats.locations === 1 ? "local" : "locais"}, <strong>{stats.sections}</strong> {stats.sections === 1 ? "trecho" : "trechos"}, <strong>{stats.items}</strong> {stats.items === 1 ? "item" : "itens"}.</span>
        ) : "."}
      </p>
      <button
        onClick={() => setActiveTab("scope")}
        className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        Ir para aba Escopo
      </button>
    </div>
  );
}

// Registro de renderers
const RENDERERS: Record<string, React.ComponentType<RendererProps>> = {
  session: SessionRenderer,
  location: LocationRenderer,
  section: SectionRenderer,
  text: TextRenderer,
  scope: ScopeRenderer,
};

// ─── BlockDocument — renderização recursiva de um bloco e seus filhos ─────────

interface BlockDocumentProps {
  block: BudgetBlock;
  budgetId: string;
  items: Record<string, BudgetItem[]>;
  imagesByBlock: Record<string, BudgetImage[]>;
  onRefresh: () => void;
  isReadOnly?: boolean;
}

function BlockDocument({ block, budgetId, items, imagesByBlock, onRefresh, isReadOnly }: BlockDocumentProps) {
  const Renderer = RENDERERS[block.type];
  const isSession = block.type === "session";
  const isLocation = block.type === "location";
  const isSection = block.type === "section";
  const isRoot = block.depth === 0;

  return (
    <div id={`block-${block.id}`}>
      {/* Separador visual entre sessões raiz */}
      {isRoot && isSession && (
        <hr className="border-border mb-6" />
      )}

      {/* Conteúdo do bloco */}
      <div className={
        isSession
          ? isRoot ? "mb-6" : "mb-4"
          : isLocation
            ? "mb-4"
            : isSection
              ? "mb-3"
              : "mb-6"
      }>
        {Renderer ? (
          <Renderer block={block} budgetId={budgetId} items={items} imagesByBlock={imagesByBlock} onRefresh={onRefresh} isReadOnly={isReadOnly} />
        ) : (
          <p className="text-xs text-muted-foreground italic">
            Tipo <code>&quot;{block.type}&quot;</code> não suportado.
          </p>
        )}
      </div>

      {/* Filhos renderizados recursivamente */}
      {block.children.length > 0 && (
        <div className={isSession ? "space-y-4 mb-6" : "ml-2 space-y-3 border-l-2 border-primary/15 pl-3"}>
          {block.children.map((child) => (
            <BlockDocument
              key={child.id}
              block={child}
              budgetId={budgetId}
              items={items}
              imagesByBlock={imagesByBlock}
              onRefresh={onRefresh}
              isReadOnly={isReadOnly}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── CompositorContent ────────────────────────────────────────────────────────

interface CompositorContentProps {
  roots: BudgetBlock[];
  budgetId: string;
  items: Record<string, BudgetItem[]>;
  imagesByBlock: Record<string, BudgetImage[]>;
  onRefresh: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isReadOnly?: boolean;
}

export function CompositorContent({ roots, budgetId, items, imagesByBlock, onRefresh, scrollRef, isReadOnly }: CompositorContentProps) {
  if (roots.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
        Use o menu lateral para criar a estrutura do orçamento.
      </div>
    );
  }

  return (
    // Fundo levemente azulado em toda a área do documento
    <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 bg-primary/[0.015]">
      <div className="w-full p-6 space-y-2">
        {roots.map((block) => (
          <BlockDocument
            key={block.id}
            block={block}
            budgetId={budgetId}
            items={items}
            imagesByBlock={imagesByBlock}
            onRefresh={onRefresh}
            isReadOnly={isReadOnly}
          />
        ))}
      </div>
    </div>
  );
}
