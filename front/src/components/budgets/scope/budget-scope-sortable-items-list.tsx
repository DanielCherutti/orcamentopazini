"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    DndContext,
    closestCenter,
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
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import type { ProductGroup } from "@/actions/product-group-actions";
import type { BudgetItem } from "@/types/budget-types";
import {
    deleteBudgetItemsBulkAction,
    reorderSectionItemsAction,
} from "@/actions/budget-hierarchy-section-items-actions";
import { Button } from "@/components/ui/button";
import { buildItemSegments, type ItemSegment } from "./budget-scope-utils";
import { ScopeItemRow } from "./budget-scope-item-row";
import type { LocationAssemblyMode, PriceAdjustmentMode } from "@/lib/budgets/scope-pricing";

/** Id estável e único por segmento na lista (o mesmo grupo de catálogo pode aparecer em mais de um bloco). */
function getSegmentSortableId(seg: ItemSegment): string {
    if (seg.type === "standalone") return seg.item.id!;
    return `group-block:${seg.items[0].id!}`;
}

/** Lista só leitura com virtualização — evita milhares de nós no DOM em trechos enormes. */
function ReadOnlyVirtualItemsList({
    segments,
    budgetId,
    onRefresh,
    groups: _groups,
    assemblyMode,
    assemblyByItemId,
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: {
    segments: ItemSegment[];
    budgetId: string;
    onRefresh: () => void;
    groups: ProductGroup[];
    assemblyMode: LocationAssemblyMode;
    assemblyByItemId: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
}) {
    const parentRef = useRef<HTMLDivElement>(null);
    /* TanStack Virtual: retorno não é memoizável pelo React Compiler — uso intencional. */
    // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer
    const virtualizer = useVirtualizer({
        count: segments.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 104,
        overscan: 8,
    });

    return (
        <div
            ref={parentRef}
            className="max-h-[min(75vh,900px)] overflow-auto rounded-md [scrollbar-gutter:stable]"
        >
            <div
                className="relative w-full"
                style={{ height: virtualizer.getTotalSize() }}
            >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                    const seg = segments[virtualRow.index];
                    return (
                        <div
                            key={getSegmentSortableId(seg)}
                            data-index={virtualRow.index}
                            ref={virtualizer.measureElement}
                            className="absolute left-0 top-0 w-full"
                            style={{ transform: `translateY(${virtualRow.start}px)` }}
                        >
                            {seg.type === "standalone" ? (
                                <ScopeItemRow
                                    item={seg.item}
                                    budgetId={budgetId}
                                    isReadOnly
                                    onRefresh={onRefresh}
                                    assemblyMode={assemblyMode}
                                    assemblyByItemId={assemblyByItemId}
                                    priceAdjustmentEnabled={priceAdjustmentEnabled}
                                    priceAdjustmentInputMode={priceAdjustmentInputMode}
                                    quoteMarkupPercent={quoteMarkupPercent}
                                    quoteDiscountPercent={quoteDiscountPercent}
                                />
                            ) : (
                                <ReadOnlyGroupBlock
                                    seg={seg}
                                    budgetId={budgetId}
                                    onRefresh={onRefresh}
                                    assemblyMode={assemblyMode}
                                    assemblyByItemId={assemblyByItemId}
                                    priceAdjustmentEnabled={priceAdjustmentEnabled}
                                    priceAdjustmentInputMode={priceAdjustmentInputMode}
                                    quoteMarkupPercent={quoteMarkupPercent}
                                    quoteDiscountPercent={quoteDiscountPercent}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ReadOnlyGroupBlock({
    seg,
    budgetId,
    onRefresh,
    assemblyMode,
    assemblyByItemId,
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: {
    seg: Extract<ItemSegment, { type: "group" }>;
    budgetId: string;
    onRefresh: () => void;
    assemblyMode: LocationAssemblyMode;
    assemblyByItemId: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
}) {
    return (
        <div className="rounded-lg border-2 border-primary/45 bg-muted/20 py-1.5 shadow-sm">
            <div className="mb-2 flex items-center gap-2 px-2 pt-0.5">
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
                <span className="min-w-0 flex-1 px-1 text-center text-xs font-semibold uppercase leading-snug tracking-wide text-muted-foreground [overflow-wrap:anywhere] break-words">
                    {seg.name}
                </span>
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
            </div>
            <div className="mx-2 mb-1 rounded-bl-md border-s-[3px] border-primary/40 ps-2.5">
                {seg.items.map((item) => (
                    <div key={item.id} className="mb-1">
                        <ScopeItemRow
                            item={item}
                            budgetId={budgetId}
                            isReadOnly
                            onRefresh={onRefresh}
                            indented
                            assemblyMode={assemblyMode}
                            assemblyByItemId={assemblyByItemId}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                        />
                    </div>
                ))}
            </div>
            <div className="mt-1 flex items-center gap-2 px-2 pb-0.5">
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
                <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                    Fim do grupo
                </span>
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
            </div>
        </div>
    );
}

type SortableItemsListProps = {
    items: BudgetItem[];
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    groups?: ProductGroup[];
    assemblyMode?: LocationAssemblyMode;
    assemblyByItemId?: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
};

/** Só leitura: segmentos + virtualização, sem custo de @dnd-kit. */
function SortableItemsListReadonly({
    items,
    budgetId,
    onRefresh,
    groups = [],
    assemblyMode = "percent",
    assemblyByItemId = {},
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: SortableItemsListProps) {
    const [segments, setSegments] = useState<ItemSegment[]>(() => buildItemSegments(items));
    useEffect(() => {
        setSegments(buildItemSegments(items));
    }, [items]);
    return (
        <ReadOnlyVirtualItemsList
            segments={segments}
            budgetId={budgetId}
            onRefresh={onRefresh}
            groups={groups}
            assemblyMode={assemblyMode}
            assemblyByItemId={assemblyByItemId}
            priceAdjustmentEnabled={priceAdjustmentEnabled}
            priceAdjustmentInputMode={priceAdjustmentInputMode}
            quoteMarkupPercent={quoteMarkupPercent}
            quoteDiscountPercent={quoteDiscountPercent}
        />
    );
}

function SortableItemsListEditable({
    items,
    budgetId,
    onRefresh,
    groups = [],
    assemblyMode = "percent",
    assemblyByItemId = {},
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
}: SortableItemsListProps) {
    const confirmDialog = useConfirmDialog();
    const [segments, setSegments] = useState<ItemSegment[]>(() => buildItemSegments(items));
    const segmentsRef = useRef(segments);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    const selectableItemIds = useMemo(
        () => items.map((i) => i.id).filter((id): id is string => Boolean(id)),
        [items]
    );

    useEffect(() => {
        const valid = new Set(selectableItemIds);
        setSelectedIds((prev) => {
            let changed = false;
            const next = new Set<string>();
            for (const id of prev) {
                if (valid.has(id)) next.add(id);
                else changed = true;
            }
            return changed ? next : prev;
        });
    }, [selectableItemIds]);

    useEffect(() => {
        segmentsRef.current = segments;
    }, [segments]);

    useEffect(() => {
        setSegments(buildItemSegments(items));
    }, [items]);

    const toggleItemSelected = useCallback((id: string, checked: boolean) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    }, []);

    const selectAllItems = useCallback(() => {
        setSelectedIds(new Set(selectableItemIds));
    }, [selectableItemIds]);

    const handleBulkDelete = useCallback(async () => {
        const ids = [...selectedIds];
        if (ids.length === 0) return;
        const ok = await confirmDialog({
            title: "Remover produtos",
            description: `Remover ${ids.length} produto(s) deste trecho?`,
            confirmLabel: "Remover",
            destructive: true,
        });
        if (!ok) return;
        setBulkDeleting(true);
        try {
            const result = await deleteBudgetItemsBulkAction(ids, budgetId);
            if (!result.success) {
                toast.error(result.error || "Erro ao remover produtos");
                return;
            }
            if (result.deletedCount > 0) {
                toast.success(
                    result.deletedCount === 1
                        ? "1 produto removido."
                        : `${result.deletedCount} produtos removidos.`
                );
            }
            setSelectedIds(new Set());
            onRefresh();
        } finally {
            setBulkDeleting(false);
        }
    }, [selectedIds, budgetId, onRefresh, confirmDialog]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const segmentIds = segments.map((seg) => getSegmentSortableId(seg));

    const flattenToIds = (segs: ItemSegment[]) =>
        segs.flatMap((seg) =>
            seg.type === "standalone" ? [seg.item.id!] : seg.items.map((i) => i.id!)
        );

    const handleOuterDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeStr = active.id as string;
        const overStr = over.id as string;
        const oldIdx = segmentIds.indexOf(activeStr);
        const newIdx = segmentIds.indexOf(overStr);
        if (oldIdx === -1 || newIdx === -1) return;

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
        async (groupAnchorItemId: string, oldIdx: number, newIdx: number) => {
            const current = segmentsRef.current;
            const segIdx = current.findIndex(
                (s) => s.type === "group" && s.items[0]?.id === groupAnchorItemId
            );
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
        [budgetId]
    );

    return (
        <>
            {selectableItemIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={selectAllItems}
                        disabled={bulkDeleting}
                    >
                        Selecionar todos
                    </Button>
                    {selectedIds.size > 0 && (
                        <>
                            <span className="text-xs text-muted-foreground tabular-nums">
                                {selectedIds.size} selecionado(s)
                            </span>
                            <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => void handleBulkDelete()}
                                disabled={bulkDeleting}
                            >
                                Remover selecionados
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setSelectedIds(new Set())}
                                disabled={bulkDeleting}
                            >
                                Limpar seleção
                            </Button>
                        </>
                    )}
                </div>
            )}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleOuterDragEnd}
            >
                <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
                    <div className="max-h-[min(75vh,900px)] overflow-y-auto rounded-md [scrollbar-gutter:stable]">
                        <div className="space-y-1">
                            {segments.map((seg) =>
                                seg.type === "standalone" ? (
                                    <SortableStandaloneItem
                                        key={getSegmentSortableId(seg)}
                                        item={seg.item}
                                        budgetId={budgetId}
                                        isReadOnly={false}
                                        onRefresh={onRefresh}
                                        groups={groups}
                                        assemblyMode={assemblyMode}
                                        assemblyByItemId={assemblyByItemId}
                                        priceAdjustmentEnabled={priceAdjustmentEnabled}
                                        priceAdjustmentInputMode={priceAdjustmentInputMode}
                                        quoteMarkupPercent={quoteMarkupPercent}
                                        quoteDiscountPercent={quoteDiscountPercent}
                                        selectionEnabled
                                        selected={Boolean(seg.item.id && selectedIds.has(seg.item.id))}
                                        onToggleSelected={(checked) => {
                                            if (seg.item.id) toggleItemSelected(seg.item.id, checked);
                                        }}
                                    />
                                ) : (
                                    <SortableGroup
                                        key={getSegmentSortableId(seg)}
                                        seg={seg}
                                        sensors={sensors}
                                        budgetId={budgetId}
                                        isReadOnly={false}
                                        onRefresh={onRefresh}
                                        onItemReorder={handleGroupItemReorder}
                                        groups={groups}
                                        assemblyMode={assemblyMode}
                                        assemblyByItemId={assemblyByItemId}
                                        priceAdjustmentEnabled={priceAdjustmentEnabled}
                                        priceAdjustmentInputMode={priceAdjustmentInputMode}
                                        quoteMarkupPercent={quoteMarkupPercent}
                                        quoteDiscountPercent={quoteDiscountPercent}
                                        selectedIds={selectedIds}
                                        onToggleItemSelected={toggleItemSelected}
                                    />
                                )
                            )}
                        </div>
                    </div>
                </SortableContext>
            </DndContext>
        </>
    );
}

export function SortableItemsList(props: SortableItemsListProps) {
    if (props.isReadOnly) {
        return <SortableItemsListReadonly {...props} />;
    }
    return <SortableItemsListEditable {...props} />;
}

function SortableStandaloneItem({
    item,
    budgetId,
    isReadOnly,
    onRefresh,
    groups: _groups,
    assemblyMode,
    assemblyByItemId,
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    selectionEnabled = false,
    selected = false,
    onToggleSelected,
}: {
    item: BudgetItem;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    groups: ProductGroup[];
    assemblyMode: LocationAssemblyMode;
    assemblyByItemId: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    selectionEnabled?: boolean;
    selected?: boolean;
    onToggleSelected?: (checked: boolean) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id!,
        disabled: isReadOnly,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(isDragging && "opacity-50 z-10 relative")}
        >
            <ScopeItemRow
                item={item}
                budgetId={budgetId}
                isReadOnly={isReadOnly}
                onRefresh={onRefresh}
                assemblyMode={assemblyMode}
                assemblyByItemId={assemblyByItemId}
                priceAdjustmentEnabled={priceAdjustmentEnabled}
                priceAdjustmentInputMode={priceAdjustmentInputMode}
                quoteMarkupPercent={quoteMarkupPercent}
                quoteDiscountPercent={quoteDiscountPercent}
                dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
                selectionEnabled={selectionEnabled}
                selected={selected}
                onSelectionChange={onToggleSelected}
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
    assemblyMode,
    assemblyByItemId,
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    selectedIds,
    onToggleItemSelected,
}: {
    seg: Extract<ItemSegment, { type: "group" }>;
    sensors: ReturnType<typeof useSensors>;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    onItemReorder: (groupAnchorItemId: string, oldIdx: number, newIdx: number) => void;
    groups: ProductGroup[];
    assemblyMode: LocationAssemblyMode;
    assemblyByItemId: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    selectedIds: Set<string>;
    onToggleItemSelected: (id: string, checked: boolean) => void;
}) {
    const outerId = getSegmentSortableId(seg);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: outerId,
        disabled: isReadOnly,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const groupItemIds = seg.items.map((i) => i.id!);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "rounded-lg border-2 border-primary/45 bg-muted/20 py-1.5 shadow-sm",
                isDragging && "opacity-50 z-10 relative"
            )}
        >
            {/* Cabeçalho do grupo — linhas + título */}
            <div className="mb-2 flex items-center gap-2 px-2 pt-0.5">
                {!isReadOnly && (
                    <button
                        {...attributes}
                        {...listeners}
                        type="button"
                        className="cursor-grab touch-none shrink-0 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                    >
                        <GripVertical className="h-3.5 w-3.5" />
                    </button>
                )}
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
                <span className="min-w-0 flex-1 px-1 text-center text-xs font-semibold uppercase leading-snug tracking-wide text-muted-foreground [overflow-wrap:anywhere] break-words">
                    {seg.name}
                </span>
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
            </div>
            {/* Itens com trilho à esquerda para fechar visualmente com o rodapé */}
            <div className="mx-2 mb-1 rounded-bl-md border-s-[3px] border-primary/40 ps-2.5">
                <DndContext
                    id={`group-dnd-${seg.items[0].id}`}
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const oldIdx = seg.items.findIndex((i) => i.id === active.id);
                        const newIdx = seg.items.findIndex((i) => i.id === over.id);
                        if (oldIdx !== -1 && newIdx !== -1) onItemReorder(seg.items[0].id!, oldIdx, newIdx);
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
                                assemblyMode={assemblyMode}
                                assemblyByItemId={assemblyByItemId}
                                priceAdjustmentEnabled={priceAdjustmentEnabled}
                                priceAdjustmentInputMode={priceAdjustmentInputMode}
                                quoteMarkupPercent={quoteMarkupPercent}
                                quoteDiscountPercent={quoteDiscountPercent}
                                selectionEnabled
                                selected={Boolean(item.id && selectedIds.has(item.id))}
                                onToggleSelected={(checked) => {
                                    if (item.id) onToggleItemSelected(item.id, checked);
                                }}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
            {/* Rodapé espelhado — deixa explícito onde o grupo termina */}
            <div className="mt-1 flex items-center gap-2 px-2 pb-0.5">
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
                <span className="shrink-0 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                    Fim do grupo
                </span>
                <div className="h-0.5 min-w-6 flex-1 rounded-full bg-muted-foreground/35" />
            </div>
        </div>
    );
}

function SortableGroupItem({
    item,
    budgetId,
    isReadOnly,
    onRefresh,
    groups: _groups,
    assemblyMode,
    assemblyByItemId,
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    selectionEnabled = false,
    selected = false,
    onToggleSelected,
}: {
    item: BudgetItem;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    groups: ProductGroup[];
    assemblyMode: LocationAssemblyMode;
    assemblyByItemId: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    selectionEnabled?: boolean;
    selected?: boolean;
    onToggleSelected?: (checked: boolean) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: item.id!,
        disabled: isReadOnly,
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn("mb-1", isDragging && "opacity-50 z-10 relative")}
        >
            <ScopeItemRow
                item={item}
                budgetId={budgetId}
                isReadOnly={isReadOnly}
                onRefresh={onRefresh}
                indented
                assemblyMode={assemblyMode}
                assemblyByItemId={assemblyByItemId}
                priceAdjustmentEnabled={priceAdjustmentEnabled}
                priceAdjustmentInputMode={priceAdjustmentInputMode}
                quoteMarkupPercent={quoteMarkupPercent}
                quoteDiscountPercent={quoteDiscountPercent}
                dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
                selectionEnabled={selectionEnabled}
                selected={selected}
                onSelectionChange={onToggleSelected}
            />
        </div>
    );
}
