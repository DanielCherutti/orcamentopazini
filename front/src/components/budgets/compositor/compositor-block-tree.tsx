"use client";

import type { ComponentType, RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Map as MapIcon, ArrowRight, Plus, Power, Table2, Upload } from "lucide-react";
import {
    DndContext,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableTitle } from "@/components/budgets/editor/editable-title";
import {
    CompositorRichTextEditor,
    CollapsibleEditorSection,
} from "@/components/budgets/compositor/compositor-rich-text-editor";
import { CompositorItemCreator } from "@/components/budgets/compositor/compositor-item-creator";
import { getScopeBlockLabel } from "@/components/budgets/compositor/compositor-content-utils";
import { AddGroupDialog } from "@/components/budgets/editor/add-group-dialog";
import { BudgetImageGallery } from "@/components/budgets/budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "@/components/budgets/budget-photo-annotator-dialog";
import { parseAnnotatorViewport } from "@/components/annotator/annotator-viewport-types";
import { toast } from "@/lib/toast";
import {
    addGroupToBlockAction,
    deleteItemFromBlockAction,
    reorderItemsInBlockAction,
} from "@/actions/budget-compositor-block-items-actions";
import { updateBlockAction } from "@/actions/budget-compositor-block-actions";
import { useCompositorRuntime } from "./compositor-runtime-context";
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import { deleteBudgetImage } from "@/actions/budget-annotations";
import { getScopeStatsAction } from "@/actions/budget-scope-actions";
import { useWorkspaceTab } from "@/components/budgets/workspace-context";
import type {
    BudgetBlock,
    HeaderFooterBlockProps,
} from "@/types/budget-compositor-types";
import { DEFAULT_HEADER_FOOTER_PROPS } from "@/types/budget-compositor-types";
import type { BudgetItem, BudgetImage } from "@/types/budget-types";
import { toAbsoluteImageUrl } from "@/lib/utils";
import {
    buildItemSegments,
    EMPTY_ITEMS,
    findBlockInTree,
    formatCurrency,
} from "./compositor-content-utils";
import { useBlockDescription, useBlockLabel } from "./compositor-content-hooks";
import { CompositorItemRow } from "./compositor-item-row";
import { CompositorDocumentContext } from "./compositor-document-context";
import { CompositorCoverBlock } from "./compositor-cover-block";
import { HeaderFooterLayoutEditor } from "./header-footer-layout-editor";
import { DocumentMarginControls } from "./document-margin-controls";
import {
    migrateHeaderFooterLayoutsForScopeMode,
    resolveHeaderFooterScopeMode,
} from "@/lib/compositor/header-footer-layout";
import { CompositorTocBlock } from "./compositor-toc-block";
import { CompositorFiguresBlock } from "./compositor-figures-block";
import type { ScopeFigureEntry } from "./compositor-figures-utils";
import { useScopeFigureNumbers } from "@/components/budgets/use-scope-figure-numbers";
import { parseFigureFrameOrientation } from "@/lib/budgets/figure-frame-utils";

// ─── Renderers de bloco (modo documento) ──────────────────────────────────────

function CoverRenderer({ block, budgetId, isReadOnly }: CompositorRendererProps) {
    return <CompositorCoverBlock block={block} budgetId={budgetId} isReadOnly={isReadOnly} />;
}

function TocRenderer({ block, isReadOnly }: CompositorRendererProps) {
    return <CompositorTocBlock block={block} isReadOnly={isReadOnly} />;
}

function FiguresRenderer({ block, isReadOnly }: CompositorRendererProps) {
    return <CompositorFiguresBlock block={block} isReadOnly={isReadOnly} />;
}

export interface CompositorRendererProps {
    block: BudgetBlock;
    budgetId: string;
    budgetCode?: string | null;
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    onRefresh: () => void;
    isReadOnly?: boolean;
}

function SessionRenderer({
    block,
    budgetId,
    onRefresh,
    isReadOnly,
}: CompositorRendererProps) {
    const { actions } = useCompositorRuntime();
    const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
    const { description, handleChange } = useBlockDescription(
        block,
        budgetId,
        onRefresh,
    );
    const isRoot = block.depth === 0;

    return (
        <div
            className={`space-y-3 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40 ${isRoot ? "mb-1" : "mb-4"}`}
        >
            <div
                className={`flex items-baseline gap-3 pb-2 mb-2 ${isRoot ? "border-b-2 border-primary" : "border-b border-primary/50"}`}
            >
                {block.number && (
                    <span
                        className={`shrink-0 font-mono font-bold text-primary ${isRoot ? "text-2xl" : "text-xl"}`}
                    >
                        {block.number}.
                    </span>
                )}
                <EditableTitle
                    value={block.label || "Seção"}
                    onSave={handleSaveLabel}
                    className={
                        isRoot
                            ? "text-2xl font-bold text-foreground uppercase"
                            : "text-xl font-semibold text-foreground capitalize"
                    }
                />
            </div>
            <CollapsibleEditorSection label="Descrição">
                <CompositorRichTextEditor
                    key={block.id}
                    budgetId={budgetId}
                    value={description}
                    onChange={handleChange}
                    placeholder="Descrição da seção..."
                />
            </CollapsibleEditorSection>
            {isRoot ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                        checked={block.props?.page_break_before !== false}
                        disabled={isReadOnly}
                        onCheckedChange={async (checked) => {
                            const result = await actions.updateBlockAction(block.id, budgetId, {
                                props: { page_break_before: checked === true },
                            });
                            if (!result.success) toast.error(result.error || "Erro ao salvar quebra de página");
                            else onRefresh();
                        }}
                    />
                    Iniciar esta seção em uma nova página
                </label>
            ) : null}
        </div>
    );
}

function LocationRenderer({
    block,
    budgetId,
    imagesByBlock,
    onRefresh,
}: CompositorRendererProps) {
    const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
    const { description, handleChange } = useBlockDescription(
        block,
        budgetId,
        onRefresh,
    );
    const images = imagesByBlock[block.id] ?? [];
    const [addPhotoOpen, setAddPhotoOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
    const locationImageIdsKey = useMemo(
        () => [...images].map((i) => i.id).sort().join(","),
        [images],
    );
    const figureNumbersByImageId = useScopeFigureNumbers(budgetId, locationImageIdsKey);

    const handleDeleteImage = async (image: BudgetImage) => {
        const result = await deleteBudgetImage(image.id, budgetId);
        if (!result.success) toast.error(result.error || "Erro ao excluir foto");
        else onRefresh();
    };

    return (
        <div className="space-y-4 bg-primary/[0.03] rounded-lg p-4 border-l-4 border-l-primary/40 border border-primary/20 shadow-sm">
            <div className="flex items-baseline gap-3 pb-2 border-b-2 border-primary/50 mb-2">
                {block.number && (
                    <span className="shrink-0 font-mono font-semibold text-lg text-primary">
                        {block.number}.
                    </span>
                )}
                <EditableTitle
                    value={block.label || "Local"}
                    onSave={handleSaveLabel}
                    className="text-lg font-semibold text-foreground"
                />
            </div>

            <CollapsibleEditorSection label="Descrição" defaultOpen={false}>
                <CompositorRichTextEditor
                    key={block.id}
                    budgetId={budgetId}
                    value={description}
                    onChange={handleChange}
                    placeholder="Descreva o local..."
                    galleryImages={images}
                />
            </CollapsibleEditorSection>

            <CollapsibleEditorSection label="Fotos do local">
                <BudgetImageGallery
                    images={images}
                    figureNumbersByImageId={figureNumbersByImageId}
                    onAdd={() => setAddPhotoOpen(true)}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto. Clique em Adicionar Foto para começar."
                />
            </CollapsibleEditorSection>

            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                blockId={block.id}
                open={addPhotoOpen}
                onOpenChange={setAddPhotoOpen}
                onSaved={() => {
                    setAddPhotoOpen(false);
                    onRefresh();
                }}
            />
            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                blockId={block.id}
                imageId={editingImage?.id}
                initialImageUrl={
                    editingImage?.url || editingImage?.composed_url
                        ? toAbsoluteImageUrl(
                              editingImage!.url || editingImage!.composed_url,
                          )
                        : null
                }
                initialAnnotations={
                    (editingImage?.annotations ?? []) as unknown as Parameters<
                        typeof BudgetPhotoAnnotatorDialog
                    >[0]["initialAnnotations"]
                }
                initialEditorViewport={parseAnnotatorViewport(editingImage?.editor_viewport)}
                initialCaption={editingImage?.caption ?? ""}
                initialFigureFrameOrientation={
                    editingImage
                        ? parseFigureFrameOrientation(editingImage.figure_frame_orientation) ?? null
                        : null
                }
                open={!!editingImage}
                onOpenChange={(open) => {
                    if (!open) setEditingImage(null);
                }}
                onSaved={() => {
                    setEditingImage(null);
                    onRefresh();
                }}
            />
        </div>
    );
}

function SectionRenderer({
    block,
    budgetId,
    items,
    imagesByBlock,
    onRefresh,
    isReadOnly,
}: CompositorRendererProps) {
    const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
    const { description, handleChange } = useBlockDescription(
        block,
        budgetId,
        onRefresh,
    );
    const images = imagesByBlock[block.id] ?? [];
    const sectionBlockImageIdsKey = useMemo(
        () => [...images].map((i) => i.id).sort().join(","),
        [images],
    );
    const figureNumbersByImageId = useScopeFigureNumbers(budgetId, sectionBlockImageIdsKey);
    const [addPhotoOpen, setAddPhotoOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
    const [localItems, setLocalItems] = useState<BudgetItem[]>(
        items[block.id] ?? EMPTY_ITEMS,
    );
    const [groups, setGroups] = useState<ProductGroup[]>([]);
    const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);

    useEffect(() => {
        void listProductGroupsAction().then((res) => {
            if (res.success && res.data) setGroups(res.data);
        });
    }, []);

    const serverItems = items[block.id] ?? EMPTY_ITEMS;
    const [prevServerItems, setPrevServerItems] = useState(serverItems);
    if (prevServerItems !== serverItems) {
        setPrevServerItems(serverItems);
        setLocalItems(serverItems);
    }

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    );

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
        setLocalItems(reordered);

        const itemIds = reordered.map((i) => i.id!);
        const result = await reorderItemsInBlockAction(block.id, itemIds);
        if (!result.success) {
            toast.error(result.error || "Erro ao reordenar itens");
            setLocalItems(localItems);
        }
    };

    const addGroupToSection = async (
        _sectionId: string,
        _budgetId: string,
        groupId: string,
        groupName: string,
        productQuantities: Record<string, number>,
        selectedProductIds: string[],
    ) =>
        addGroupToBlockAction(
            block.id,
            budgetId,
            groupId,
            groupName,
            productQuantities,
            selectedProductIds,
        );

    const total = localItems.reduce((sum, i) => sum + (i.total || 0), 0);
    const segments = buildItemSegments(localItems);

    return (
        <div className="space-y-4 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40 mb-4">
            <div className="flex items-baseline gap-3 border-b border-border pb-2">
                {block.number && (
                    <span className="shrink-0 font-mono font-semibold text-base text-primary">
                        {block.number}.
                    </span>
                )}
                <EditableTitle
                    value={block.label || "Trecho"}
                    onSave={handleSaveLabel}
                    className="text-base font-semibold text-foreground"
                />
            </div>

            <CollapsibleEditorSection label="Observações do trecho">
                <CompositorRichTextEditor
                    key={block.id}
                    budgetId={budgetId}
                    value={description}
                    onChange={handleChange}
                    placeholder="Observações, especificações técnicas..."
                    galleryImages={images}
                />
            </CollapsibleEditorSection>

            <CollapsibleEditorSection
                label="Produtos"
                rightContent={
                    localItems.length > 0 ? `Total: ${formatCurrency(total)}` : undefined
                }
            >
                {localItems.length > 0 && (
                    <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
                        <div className="col-span-1" />
                        <div className="col-span-4">Produto</div>
                        <div className="col-span-2 text-center">Qtd</div>
                        <div className="hidden md:block md:col-span-2 text-right">
                            MO unit.
                        </div>
                        <div className="hidden md:block md:col-span-1 text-right">
                            Equipto.
                        </div>
                        <div className="col-span-2 md:col-span-1 text-right">Total</div>
                    </div>
                )}
                <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
                    <SortableContext
                        items={localItems.map((i) => i.id!)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-1">
                            {segments.map((seg) =>
                                seg.type === "standalone" ? (
                                    <CompositorItemRow
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
                                                <CompositorItemRow
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
                                ),
                            )}
                        </div>
                    </SortableContext>
                </DndContext>
                {!isReadOnly && (
                    <div className="mt-2">
                        <CompositorItemCreator
                            blockId={block.id}
                            budgetId={budgetId}
                            onSuccess={onRefresh}
                        />
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

            <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">
                    Fotos do trecho
                </p>
                <BudgetImageGallery
                    images={images}
                    figureNumbersByImageId={figureNumbersByImageId}
                    onAdd={() => setAddPhotoOpen(true)}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto. Clique em Adicionar Foto para começar."
                />
            </div>

            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                blockId={block.id}
                availableItems={localItems}
                open={addPhotoOpen}
                onOpenChange={setAddPhotoOpen}
                onSaved={() => {
                    setAddPhotoOpen(false);
                    onRefresh();
                }}
            />
            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                blockId={block.id}
                imageId={editingImage?.id}
                availableItems={localItems}
                initialImageUrl={
                    editingImage?.url || editingImage?.composed_url
                        ? toAbsoluteImageUrl(
                              editingImage!.url || editingImage!.composed_url,
                          )
                        : null
                }
                initialAnnotations={
                    (editingImage?.annotations ?? []) as unknown as Parameters<
                        typeof BudgetPhotoAnnotatorDialog
                    >[0]["initialAnnotations"]
                }
                initialEditorViewport={parseAnnotatorViewport(editingImage?.editor_viewport)}
                initialCaption={editingImage?.caption ?? ""}
                initialFigureFrameOrientation={
                    editingImage
                        ? parseFigureFrameOrientation(editingImage.figure_frame_orientation) ?? null
                        : null
                }
                open={!!editingImage}
                onOpenChange={(open) => {
                    if (!open) setEditingImage(null);
                }}
                onSaved={() => {
                    setEditingImage(null);
                    onRefresh();
                }}
            />
        </div>
    );
}

function TextRenderer({ block, budgetId, onRefresh }: CompositorRendererProps) {
    const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);
    const { description, handleChange } = useBlockDescription(
        block,
        budgetId,
        onRefresh,
    );
    return (
        <div className="space-y-2 bg-white p-4 rounded-md shadow-sm border-l-4 border-l-primary/40">
            <div className="flex items-baseline gap-3">
                {block.number && (
                    <span className="shrink-0 font-mono font-semibold text-sm text-primary">
                        {block.number}.
                    </span>
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
                <CompositorRichTextEditor
                    key={block.id}
                    budgetId={budgetId}
                    value={description}
                    onChange={handleChange}
                    placeholder="Digite o conteúdo aqui..."
                />
            </CollapsibleEditorSection>
        </div>
    );
}

function ScopeRenderer({
    block,
    budgetId,
    onRefresh,
    isReadOnly,
}: CompositorRendererProps) {
    const [stats, setStats] = useState<{
        locations: number;
        sections: number;
        items: number;
    } | null>(null);
    const { setActiveTab } = useWorkspaceTab();
    const handleSaveLabel = useBlockLabel(block, budgetId, onRefresh);

    useEffect(() => {
        void getScopeStatsAction(budgetId).then((r) => {
            if (r.success && r.data) setStats(r.data);
        });
    }, [budgetId]);

    return (
        <div
            id={`block-${block.id}`}
            className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 space-y-3"
        >
            <div className="flex items-center gap-2">
                <MapIcon className="h-5 w-5 text-primary shrink-0" />
                <EditableTitle
                    value={getScopeBlockLabel(block.label)}
                    onSave={handleSaveLabel}
                    disabled={isReadOnly}
                    className="font-bold text-sm text-primary uppercase tracking-wide"
                />
            </div>
            <p className="text-sm text-muted-foreground">
                Este bloco expande o conteúdo configurado na aba Adequações
                {stats ? (
                    <span>
                        : <strong>{stats.locations}</strong>{" "}
                        {stats.locations === 1 ? "local" : "locais"},{" "}
                        <strong>{stats.sections}</strong>{" "}
                        {stats.sections === 1 ? "trecho" : "trechos"},{" "}
                        <strong>{stats.items}</strong>{" "}
                        {stats.items === 1 ? "item" : "itens"}.
                    </span>
                ) : (
                    "."
                )}
            </p>
            <button
                type="button"
                onClick={() => setActiveTab("scope")}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
                <ArrowRight className="h-3.5 w-3.5" />
                Ir para aba Adequações
            </button>
        </div>
    );
}

function QuoteRenderer({ block, budgetId, budgetCode }: CompositorRendererProps) {
    const [stats, setStats] = useState<{
        locations: number;
        sections: number;
        items: number;
    } | null>(null);
    const { setActiveTab } = useWorkspaceTab();
    const budgetCodeLabel = budgetCode?.trim() || "—";

    useEffect(() => {
        void getScopeStatsAction(budgetId).then((r) => {
            if (r.success && r.data) setStats(r.data);
        });
    }, [budgetId]);

    return (
        <div
            id={`block-${block.id}`}
            className="rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5 space-y-3"
        >
            <div className="flex flex-col gap-2 pb-2 border-b-2 border-primary/50 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="flex items-baseline gap-3">
                    {block.number && (
                        <span className="shrink-0 font-mono font-bold text-2xl text-primary">
                            {block.number}.
                        </span>
                    )}
                    <div className="flex items-center gap-2 min-w-0">
                        <Table2 className="h-5 w-5 text-primary shrink-0" />
                        <span className="font-bold text-sm text-primary uppercase tracking-wide">
                            ORÇAMENTO
                        </span>
                    </div>
                </div>
                <span className="text-[11px] font-semibold text-muted-foreground">
                    Código do Orçamento:{" "}
                    <span className="font-bold text-foreground">{budgetCodeLabel}</span>
                </span>
            </div>
            <p className="text-sm text-muted-foreground">
                Este bloco representa o detalhamento financeiro (itens, valores e totais)
                {stats ? (
                    <span>
                        : <strong>{stats.locations}</strong>{" "}
                        {stats.locations === 1 ? "local" : "locais"},{" "}
                        <strong>{stats.sections}</strong>{" "}
                        {stats.sections === 1 ? "trecho" : "trechos"},{" "}
                        <strong>{stats.items}</strong>{" "}
                        {stats.items === 1 ? "item" : "itens"}.
                    </span>
                ) : (
                    "."
                )}
            </p>
            <button
                type="button"
                onClick={() => setActiveTab("quote")}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
                <ArrowRight className="h-3.5 w-3.5" />
                Ir para aba Orçamento
            </button>
        </div>
    );
}

function mergeHeaderFooterProps(raw: Record<string, unknown> | undefined): HeaderFooterBlockProps {
    return {
        ...DEFAULT_HEADER_FOOTER_PROPS,
        ...(raw ?? {}),
    };
}

function HeaderFooterRenderer({
    block,
    budgetId,
    isReadOnly,
}: CompositorRendererProps) {
    const { actions } = useCompositorRuntime();
    const persistedProps = mergeHeaderFooterProps(block.props as Record<string, unknown> | undefined);
    const [optimisticProps, setOptimisticProps] = useState<Partial<HeaderFooterBlockProps>>({});
    const props = { ...persistedProps, ...optimisticProps };
    const scopeMode = resolveHeaderFooterScopeMode(props);
    const coverWatermarkInputRef = useRef<HTMLInputElement | null>(null);
    const innerWatermarkInputRef = useRef<HTMLInputElement | null>(null);
    const [uploadingField, setUploadingField] = useState<"cover" | "inner" | null>(null);
    const [activeBandByPane, setActiveBandByPane] = useState<{
        all: "header" | "footer";
        cover: "header" | "footer";
        inner: "header" | "footer";
    }>({
        all: "header",
        cover: "header",
        inner: "header",
    });
    const patchQueueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        setOptimisticProps({});
    }, [block.id]);

    const handlePatch = (patch: Partial<HeaderFooterBlockProps>) => {
        if (isReadOnly) return;
        setOptimisticProps((prev) => ({ ...prev, ...patch }));
        patchQueueRef.current = patchQueueRef.current
            .catch(() => undefined)
            .then(async () => {
                const res = await actions.updateBlockAction(block.id, budgetId, {
                    props: patch as Record<string, unknown>,
                });
                if (!res.success) {
                    toast.error(res.error || "Erro ao salvar cabeçalho e rodapé");
                }
            });
        return patchQueueRef.current;
    };

    const uploadWatermark = async (
        field: "cover_watermark_url" | "inner_watermark_url",
        file: File
    ) => {
        if (isReadOnly) return;
        setUploadingField(field === "cover_watermark_url" ? "cover" : "inner");
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload/library", { method: "POST", body: fd });
            const json = (await res.json()) as { url?: string; error?: string };
            if (!res.ok || !json.url) {
                toast.error(json.error || "Falha ao enviar marca d'água");
                return;
            }
            await handlePatch({ [field]: json.url });
            toast.success("Marca d'água atualizada.");
        } catch {
            toast.error("Erro ao enviar marca d'água");
        } finally {
            setUploadingField(null);
        }
    };

    const handleScopeModeChange = (mode: "all" | "separate") => {
        if (isReadOnly || mode === scopeMode) return;
        if (mode === "all") {
            const nextShowHeader =
                props.cover_show_header_band === true || props.inner_show_header_band === true;
            const nextShowFooter =
                props.cover_show_footer_band === true || props.inner_show_footer_band === true;
            const nextHeaderHeight = Math.max(props.cover_header_height ?? 96, props.inner_header_height ?? 96);
            const nextFooterHeight = Math.max(props.cover_footer_height ?? 48, props.inner_footer_height ?? 40);
            void handlePatch({
                ...migrateHeaderFooterLayoutsForScopeMode(props, "all"),
                cover_show_header_band: nextShowHeader,
                inner_show_header_band: nextShowHeader,
                cover_show_footer_band: nextShowFooter,
                inner_show_footer_band: nextShowFooter,
                cover_header_height: nextHeaderHeight,
                inner_header_height: nextHeaderHeight,
                cover_footer_height: nextFooterHeight,
                inner_footer_height: nextFooterHeight,
            });
            return;
        }
        void handlePatch(migrateHeaderFooterLayoutsForScopeMode(props, "separate"));
    };

    const renderPane = (key: "all" | "cover" | "inner") => {
        const activeBand = activeBandByPane[key];
        const headerHeight =
            key === "cover"
                ? props.cover_header_height ?? 96
                : key === "inner"
                  ? props.inner_header_height ?? 96
                  : Math.max(props.cover_header_height ?? 96, props.inner_header_height ?? 96);
        const footerHeight =
            key === "cover"
                ? props.cover_footer_height ?? 48
                : key === "inner"
                  ? props.inner_footer_height ?? 40
                  : Math.max(props.cover_footer_height ?? 48, props.inner_footer_height ?? 40);
        const watermarkUrl =
            key === "cover"
                ? props.cover_watermark_url ?? ""
                : props.inner_use_cover_watermark
                  ? props.cover_watermark_url ?? ""
                  : props.inner_watermark_url ?? "";
        const watermarkOpacity =
            key === "cover"
                ? props.cover_watermark_opacity ?? 0.12
                : props.inner_use_cover_watermark
                  ? props.cover_watermark_opacity ?? 0.12
                  : props.inner_watermark_opacity ?? 0.06;
        const watermarkScale =
            key === "cover"
                ? props.cover_watermark_scale_pct ?? 100
                : props.inner_use_cover_watermark
                  ? props.cover_watermark_scale_pct ?? 100
                  : props.inner_watermark_scale_pct ?? 100;
        const allBandsEnabled =
            props.cover_show_header_band === true &&
            props.cover_show_footer_band === true &&
            props.inner_show_header_band === true &&
            props.inner_show_footer_band === true;
        const coverBandsEnabled =
            props.cover_show_header_band === true && props.cover_show_footer_band === true;
        const innerBandsEnabled =
            props.inner_show_header_band === true && props.inner_show_footer_band === true;
        const headerEnabled =
            key === "cover"
                ? props.cover_show_header_band === true
                : key === "inner"
                  ? props.inner_show_header_band === true
                  : props.cover_show_header_band === true && props.inner_show_header_band === true;
        const footerEnabled =
            key === "cover"
                ? props.cover_show_footer_band === true
                : key === "inner"
                  ? props.inner_show_footer_band === true
                  : props.cover_show_footer_band === true && props.inner_show_footer_band === true;
        const effectiveBand =
            activeBand === "header" && !headerEnabled && footerEnabled
                ? "footer"
                : activeBand === "footer" && !footerEnabled && headerEnabled
                  ? "header"
                  : activeBand;
        const effectiveBandEnabled = effectiveBand === "header" ? headerEnabled : footerEnabled;
        const effectiveIsHeaderActive = effectiveBand === "header";
        const effectiveHeight = effectiveIsHeaderActive ? headerHeight : footerHeight;
        return (
            <div className="space-y-4">
                {key === "all" ? (
                    <div className="rounded-lg border bg-card p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Faixas de todas as páginas (PDF)
                            </Label>
                            <Button
                                type="button"
                                variant={allBandsEnabled ? "outline" : "default"}
                                size="sm"
                                className="h-8 text-xs"
                                disabled={isReadOnly}
                                onClick={() => {
                                    const next = !allBandsEnabled;
                                    void handlePatch({
                                        cover_show_header_band: next,
                                        cover_show_footer_band: next,
                                        inner_show_header_band: next,
                                        inner_show_footer_band: next,
                                    });
                                }}
                            >
                                <Power className="mr-1.5 h-3.5 w-3.5" />
                                {allBandsEnabled ? "Desativar tudo" : "Ativar tudo"}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={
                                        props.cover_show_header_band === true &&
                                        props.inner_show_header_band === true
                                    }
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        const checked = v === true;
                                        void handlePatch({
                                            cover_show_header_band: checked,
                                            inner_show_header_band: checked,
                                        });
                                    }}
                                />
                                Ativar/desativar cabeçalho
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={
                                        props.cover_show_footer_band === true &&
                                        props.inner_show_footer_band === true
                                    }
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        const checked = v === true;
                                        void handlePatch({
                                            cover_show_footer_band: checked,
                                            inner_show_footer_band: checked,
                                        });
                                    }}
                                />
                                Ativar/desativar rodapé
                            </label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Estes controles ligam ou desligam cabeçalho e rodapé na capa e nas páginas internas.
                        </p>
                    </div>
                ) : null}
                {key === "cover" ? (
                    <div className="rounded-lg border bg-card p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Faixas da capa (PDF)
                            </Label>
                            <Button
                                type="button"
                                variant={coverBandsEnabled ? "outline" : "default"}
                                size="sm"
                                className="h-8 text-xs"
                                disabled={isReadOnly}
                                onClick={() => {
                                    const next = !coverBandsEnabled;
                                    void handlePatch({
                                        cover_show_header_band: next,
                                        cover_show_footer_band: next,
                                    });
                                }}
                            >
                                <Power className="mr-1.5 h-3.5 w-3.5" />
                                {coverBandsEnabled ? "Desativar capa" : "Ativar capa"}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={props.cover_show_header_band === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        void handlePatch({ cover_show_header_band: v === true });
                                    }}
                                />
                                Ativar/desativar cabeçalho
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={props.cover_show_footer_band === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        void handlePatch({ cover_show_footer_band: v === true });
                                    }}
                                />
                                Ativar/desativar rodapé
                            </label>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Estes dois toggles do bloco <code>header_footer</code> são a fonte principal usada pelo PDF da capa.
                        </p>
                    </div>
                ) : null}
                {key === "inner" ? (
                    <div className="rounded-lg border bg-card p-3 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Faixas das páginas internas (PDF)
                            </Label>
                            <Button
                                type="button"
                                variant={innerBandsEnabled ? "outline" : "default"}
                                size="sm"
                                className="h-8 text-xs"
                                disabled={isReadOnly}
                                onClick={() => {
                                    const next = !innerBandsEnabled;
                                    void handlePatch({
                                        inner_show_header_band: next,
                                        inner_show_footer_band: next,
                                    });
                                }}
                            >
                                <Power className="mr-1.5 h-3.5 w-3.5" />
                                {innerBandsEnabled ? "Desativar internas" : "Ativar internas"}
                            </Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={props.inner_show_header_band === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        void handlePatch({ inner_show_header_band: v === true });
                                    }}
                                />
                                Ativar/desativar cabeçalho
                            </label>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={props.inner_show_footer_band === true}
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        void handlePatch({ inner_show_footer_band: v === true });
                                    }}
                                />
                                Ativar/desativar rodapé
                            </label>
                        </div>
                    </div>
                ) : null}
                {key !== "all" ? (
                <div className="rounded-lg border bg-card p-3 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Marca d&apos;água da {key === "cover" ? "capa" : "página interna"}
                        </Label>
                        {key === "inner" && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Checkbox
                                    checked={props.inner_use_cover_watermark !== false}
                                    disabled={isReadOnly}
                                    onCheckedChange={(v) => {
                                        void handlePatch({ inner_use_cover_watermark: v === true });
                                    }}
                                />
                                Usar a mesma da capa
                            </label>
                        )}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                            placeholder="URL da marca d'água"
                            value={watermarkUrl}
                            disabled={isReadOnly || (key === "inner" && props.inner_use_cover_watermark !== false)}
                            className="h-8 min-w-0 flex-1 text-xs"
                            onChange={(e) => {
                                void handlePatch(
                                    key === "cover"
                                        ? { cover_watermark_url: e.target.value }
                                        : { inner_watermark_url: e.target.value }
                                );
                            }}
                        />
                        <input
                            ref={key === "cover" ? coverWatermarkInputRef : innerWatermarkInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="sr-only"
                            disabled={isReadOnly || (key === "inner" && props.inner_use_cover_watermark !== false)}
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                e.target.value = "";
                                if (!f) return;
                                void uploadWatermark(
                                    key === "cover" ? "cover_watermark_url" : "inner_watermark_url",
                                    f
                                );
                            }}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 text-xs"
                            disabled={
                                isReadOnly ||
                                uploadingField === key ||
                                (key === "inner" && props.inner_use_cover_watermark !== false)
                            }
                            onClick={() =>
                                (key === "cover" ? coverWatermarkInputRef : innerWatermarkInputRef).current?.click()
                            }
                        >
                            <Upload className="mr-1.5 h-3.5 w-3.5" />
                            {uploadingField === key ? "Enviando..." : "Importar"}
                        </Button>
                    </div>
                    <div className="flex items-center gap-3">
                        <Label className="text-[11px] text-muted-foreground">Opacidade</Label>
                        <input
                            type="range"
                            min={0}
                            max={0.35}
                            step={0.01}
                            disabled={isReadOnly || (key === "inner" && props.inner_use_cover_watermark !== false)}
                            value={watermarkOpacity}
                            onChange={(e) => {
                                const v = Number(e.target.value);
                                void handlePatch(
                                    key === "cover"
                                        ? { cover_watermark_opacity: v }
                                        : { inner_watermark_opacity: v }
                                );
                            }}
                            className="h-2 flex-1 accent-primary"
                        />
                        <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(watermarkOpacity * 100)}%
                        </span>
                    </div>
                    <div className="flex items-center gap-3">
                        <Label className="text-[11px] text-muted-foreground">Tamanho</Label>
                        <input
                            type="range"
                            min={40}
                            max={220}
                            step={1}
                            disabled={isReadOnly || (key === "inner" && props.inner_use_cover_watermark !== false)}
                            value={Math.max(40, Math.min(220, Number(watermarkScale) || 100))}
                            onChange={(e) => {
                                const v = Math.max(40, Math.min(220, Number(e.target.value) || 100));
                                void handlePatch(
                                    key === "cover"
                                        ? { cover_watermark_scale_pct: v }
                                        : { inner_watermark_scale_pct: v }
                                );
                            }}
                            className="h-2 flex-1 accent-primary"
                        />
                        <span className="w-14 text-right text-xs tabular-nums text-muted-foreground">
                            {Math.round(Math.max(40, Math.min(220, Number(watermarkScale) || 100)))}%
                        </span>
                    </div>
                </div>
                ) : null}
                <div className="rounded-lg border bg-card p-3">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-md border bg-background p-1">
                            {headerEnabled ? (
                                <button
                                    type="button"
                                    className={`h-7 rounded px-2 text-xs font-medium transition ${
                                        effectiveIsHeaderActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                                    }`}
                                    onClick={() =>
                                        setActiveBandByPane((prev) => ({ ...prev, [key]: "header" }))
                                    }
                                >
                                    {key === "cover"
                                        ? "Cabeçalho - Capa"
                                        : key === "inner"
                                          ? "Cabeçalho - Páginas internas"
                                          : "Cabeçalho - Todas as páginas"}
                                </button>
                            ) : null}
                            {footerEnabled ? (
                                <button
                                    type="button"
                                    className={`h-7 rounded px-2 text-xs font-medium transition ${
                                        !effectiveIsHeaderActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                                    }`}
                                    onClick={() =>
                                        setActiveBandByPane((prev) => ({ ...prev, [key]: "footer" }))
                                    }
                                >
                                    {key === "cover"
                                        ? "Rodapé - Capa"
                                        : key === "inner"
                                          ? "Rodapé - Páginas internas"
                                          : "Rodapé - Todas as páginas"}
                                </button>
                            ) : null}
                        </div>
                        {effectiveBandEnabled ? (
                        <div className="ml-auto flex items-center gap-2">
                            <Label className="text-[11px] text-muted-foreground">
                                Altura do {effectiveIsHeaderActive ? "cabeçalho" : "rodapé"}
                            </Label>
                            <Input
                                type="number"
                                min={24}
                                max={240}
                                step={1}
                                disabled={isReadOnly}
                                className="h-8 w-24 text-xs"
                                value={effectiveHeight}
                                onChange={(e) => {
                                    const next = Math.max(24, Math.min(240, Number(e.target.value) || 24));
                                    if (effectiveIsHeaderActive) {
                                        void handlePatch(
                                            key === "cover"
                                                ? { cover_header_height: next }
                                                : key === "all"
                                                  ? { cover_header_height: next, inner_header_height: next }
                                                : { inner_header_height: next }
                                        );
                                    } else {
                                        void handlePatch(
                                            key === "cover"
                                                ? { cover_footer_height: next }
                                                : key === "all"
                                                  ? { cover_footer_height: next, inner_footer_height: next }
                                                : { inner_footer_height: next }
                                        );
                                    }
                                }}
                            />
                        </div>
                        ) : null}
                    </div>
                    {effectiveBandEnabled ? (
                        <HeaderFooterLayoutEditor
                            key={`${block.id}-${key}-${effectiveBand}`}
                            scope={key}
                            region={effectiveBand}
                            props={props}
                            height={effectiveHeight}
                            readOnly={Boolean(isReadOnly)}
                            onPatch={handlePatch}
                        />
                    ) : (
                        <div className="rounded-md border border-dashed bg-muted/20 px-3 py-8 text-center text-xs text-muted-foreground">
                            Ative o cabeçalho ou o rodapé acima para editar esta área no PDF.
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5 p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Cabeçalho e Rodapé</h3>
            <div className="rounded-lg border bg-card p-3">
                <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Aplicação da configuração
                </Label>
                <div className="inline-flex rounded-md border bg-background p-1">
                    <button
                        type="button"
                        className={`h-8 rounded px-3 text-xs font-medium transition ${
                            scopeMode === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                        }`}
                        disabled={isReadOnly}
                        onClick={() => handleScopeModeChange("all")}
                    >
                        Todas as páginas iguais
                    </button>
                    <button
                        type="button"
                        className={`h-8 rounded px-3 text-xs font-medium transition ${
                            scopeMode === "separate" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                        }`}
                        disabled={isReadOnly}
                        onClick={() => handleScopeModeChange("separate")}
                    >
                        Capa e páginas internas separadas
                    </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                    {scopeMode === "all"
                        ? "O PDF usa uma única configuração. Ao separar, o layout atual será copiado para a capa e para as páginas internas."
                        : "O PDF usa configurações independentes. Ao unificar, o layout da capa será usado como base para todas as páginas."}
                </p>
            </div>
            <DocumentMarginControls
                props={props}
                disabled={isReadOnly}
                onPatch={(patch) => void handlePatch(patch)}
            />
            {scopeMode === "all" ? (
                renderPane("all")
            ) : (
                <Tabs defaultValue="cover">
                    <TabsList>
                        <TabsTrigger value="cover">Capa</TabsTrigger>
                        <TabsTrigger value="inner">Páginas internas</TabsTrigger>
                    </TabsList>
                    <TabsContent value="cover">
                        {renderPane("cover")}
                    </TabsContent>
                    <TabsContent value="inner">
                        {renderPane("inner")}
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}

const RENDERERS: Record<string, ComponentType<CompositorRendererProps>> = {
    cover: CoverRenderer,
    header_footer: HeaderFooterRenderer,
    toc: TocRenderer,
    figures: FiguresRenderer,
    session: SessionRenderer,
    location: LocationRenderer,
    section: SectionRenderer,
    text: TextRenderer,
    scope: ScopeRenderer,
    quote: QuoteRenderer,
};

interface BlockDocumentProps {
    block: BudgetBlock;
    budgetId: string;
    budgetCode?: string | null;
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    onRefresh: () => void;
    isReadOnly?: boolean;
}

function BlockDocument({
    block,
    budgetId,
    budgetCode,
    items,
    imagesByBlock,
    onRefresh,
    isReadOnly,
}: BlockDocumentProps) {
    const Renderer = RENDERERS[block.type];
    const isSession = block.type === "session";
    const isLocation = block.type === "location";
    const isSection = block.type === "section";
    const isCover = block.type === "cover";
    const isToc = block.type === "toc";
    const isFigures = block.type === "figures";
    const isQuote = block.type === "quote";
    const isRoot = block.depth === 0;

    return (
        <div id={`block-${block.id}`}>
            {isRoot && isSession && <hr className="border-border mb-6" />}
            {isRoot && isCover && <hr className="border-border mb-6" />}
            {isRoot && isToc && <hr className="border-border mb-6" />}
            {isRoot && isFigures && <hr className="border-border mb-6" />}
            {isRoot && isQuote && <hr className="border-border mb-6" />}
            <div
                className={
                    isCover || isToc || isFigures || isQuote
                        ? "mb-8"
                        : isSession
                          ? isRoot
                              ? "mb-6"
                              : "mb-4"
                          : isLocation
                            ? "mb-4"
                            : isSection
                              ? "mb-3"
                              : "mb-6"
                }
            >
                {Renderer ? (
                    <Renderer
                        block={block}
                        budgetId={budgetId}
                        budgetCode={budgetCode}
                        items={items}
                        imagesByBlock={imagesByBlock}
                        onRefresh={onRefresh}
                        isReadOnly={isReadOnly}
                    />
                ) : (
                    <p className="text-xs text-muted-foreground italic">
                        Tipo <code>&quot;{block.type}&quot;</code> não suportado.
                    </p>
                )}
            </div>

            {block.children.length > 0 && (
                <div
                    className={
                        isSession
                            ? "space-y-4 mb-6"
                            : "ml-2 space-y-3 border-l-2 border-primary/15 pl-3"
                    }
                >
                    {block.children.map((child) => (
                        <BlockDocument
                            key={child.id}
                            block={child}
                            budgetId={budgetId}
                            budgetCode={budgetCode}
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

export interface CompositorContentProps {
    roots: BudgetBlock[];
    budgetId: string;
    budgetCode?: string | null;
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    /** Imagens do Escopo (ordem da lista de figuras). */
    scopeFigures: ScopeFigureEntry[];
    onRefresh: () => void;
    scrollRef: RefObject<HTMLDivElement | null>;
    isReadOnly?: boolean;
    /**
     * Bloco selecionado no índice — mesmo padrão do Escopo (pai = tudo abaixo, filho = só aquele ramo):
     * - `session`: essa seção e todos os descendentes (subseções, locais, trechos…)
     * - `location`: local + trechos
     * - `section`: só aquele trecho
     * Demais tipos ou `null` = documento completo (todas as raízes).
     */
    selectedId?: string | null;
}

export function CompositorContent({
    roots,
    budgetId,
    budgetCode,
    items,
    imagesByBlock,
    scopeFigures,
    onRefresh,
    scrollRef,
    isReadOnly,
    selectedId = null,
}: CompositorContentProps) {
    if (roots.length === 0) {
        return (
            <div
                ref={scrollRef}
                className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8"
            >
                Use o menu lateral para criar a estrutura do compositor.
            </div>
        );
    }

    const focused =
        selectedId != null && selectedId !== ""
            ? findBlockInTree(roots, selectedId)
            : null;
    const useFocusedSubtree =
        focused &&
        (focused.type === "cover" ||
            focused.type === "header_footer" ||
            focused.type === "toc" ||
            focused.type === "figures" ||
            focused.type === "quote" ||
            focused.type === "scope" ||
            focused.type === "session" ||
            focused.type === "location" ||
            focused.type === "section");

    const blocksToRender = useFocusedSubtree && focused ? [focused] : roots;

    return (
        <CompositorDocumentContext.Provider value={{ roots, items, scopeFigures }}>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto min-h-0 bg-primary/[0.015]"
            >
                <div className="w-full p-6 space-y-2">
                    {blocksToRender.map((block) => (
                        <BlockDocument
                            key={block.id}
                            block={block}
                            budgetId={budgetId}
                            budgetCode={budgetCode}
                            items={items}
                            imagesByBlock={imagesByBlock}
                            onRefresh={onRefresh}
                            isReadOnly={isReadOnly}
                        />
                    ))}
                </div>
            </div>
        </CompositorDocumentContext.Provider>
    );
}
