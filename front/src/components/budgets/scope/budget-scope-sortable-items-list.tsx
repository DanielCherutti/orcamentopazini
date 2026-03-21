"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
import { reorderSectionItemsAction } from "@/actions/budget-hierarchy-actions";
import { buildItemSegments, type ItemSegment } from "./budget-scope-utils";
import { ScopeItemRow } from "./budget-scope-item-row";

export function SortableItemsList({
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

    useEffect(() => {
        segmentsRef.current = segments;
    }, [segments]);

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
        <div
            ref={setNodeRef}
            style={style}
            className={cn(isDragging && "opacity-50 z-10 relative")}
        >
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
                groups={groups}
                indented
                dragHandleProps={isReadOnly ? undefined : { ...attributes, ...listeners }}
            />
        </div>
    );
}
