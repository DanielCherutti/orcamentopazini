"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import type { ProductGroup } from "@/actions/product-group-actions";
import type { BudgetItem } from "@/types/budget-types";
import { reorderSectionItemsAction } from "@/actions/budget-hierarchy-section-items-actions";
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
        <div className="rounded-lg border border-border/70 bg-muted/20 py-1">
            <div className="mb-2 flex items-center gap-2 px-2 pt-0.5">
                <div className="h-px flex-1 bg-border" />
                <span
                    className="max-w-[min(100%,14rem)] shrink-0 truncate text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    title={seg.name}
                >
                    {seg.name}
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>
            <div className="mx-2 mb-1 rounded-bl-md border-s-2 border-primary/20 ps-2.5">
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
                <div className="h-px flex-1 bg-border" />
                <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground/90">
                    Fim do grupo
                </span>
                <div className="h-px flex-1 bg-border" />
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
    const [segments, setSegments] = useState<ItemSegment[]>(() => buildItemSegments(items));
    const segmentsRef = useRef(segments);

    useEffect(() => {
        segmentsRef.current = segments;
    }, [segments]);

    useEffect(() => {
        setSegments(buildItemSegments(items));
    }, [items]);

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
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleOuterDragEnd}
        >
            <SortableContext items={segmentIds} strategy={verticalListSortingStrategy}>
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
                            />
                        )
                    )}
                </div>
            </SortableContext>
        </DndContext>
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
                "rounded-lg border border-border/70 bg-muted/20 py-1",
                isDragging && "opacity-50 z-10 relative"
            )}
        >
            {/* Cabeçalho do grupo — linhas + título */}
            <div className="flex items-center gap-2 mb-2 px-2 pt-0.5">
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
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide shrink-0 max-w-[min(100%,14rem)] truncate text-center" title={seg.name}>
                    {seg.name}
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>
            {/* Itens com leve “trilho” à esquerda para fechar visualmente com o rodapé */}
            <div className="mx-2 mb-1 border-s-2 border-primary/20 ps-2.5 rounded-bl-md">
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
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            </div>
            {/* Rodapé espelhado — deixa explícito onde o grupo termina */}
            <div className="flex items-center gap-2 mt-1 px-2 pb-0.5">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] font-medium text-muted-foreground/90 uppercase tracking-wider shrink-0 whitespace-nowrap">
                    Fim do grupo
                </span>
                <div className="h-px flex-1 bg-border" />
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
            />
        </div>
    );
}
