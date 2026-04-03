"use client";

import type { ComponentType, RefObject } from "react";
import { useEffect, useMemo, useState } from "react";
import { FileText, Map as MapIcon, ArrowRight, Plus } from "lucide-react";
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
import { EditableTitle } from "@/components/budgets/editor/editable-title";
import {
    CompositorRichTextEditor,
    CollapsibleEditorSection,
} from "@/components/budgets/compositor/compositor-rich-text-editor";
import { CompositorItemCreator } from "@/components/budgets/compositor/compositor-item-creator";
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
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import { deleteBudgetImage } from "@/actions/budget-annotations";
import { getScopeStatsAction } from "@/actions/budget-scope-actions";
import { useWorkspaceTab } from "@/components/budgets/workspace-context";
import type { BudgetBlock } from "@/types/budget-compositor-types";
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
import { CompositorTocBlock } from "./compositor-toc-block";
import { CompositorFiguresBlock } from "./compositor-figures-block";
import type { ScopeFigureEntry } from "./compositor-figures-utils";
import { useScopeFigureNumbers } from "@/components/budgets/use-scope-figure-numbers";

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
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    onRefresh: () => void;
    isReadOnly?: boolean;
}

function SessionRenderer({
    block,
    budgetId,
    onRefresh,
}: CompositorRendererProps) {
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
                    value={block.label || "Sessão"}
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
                    value={description}
                    onChange={handleChange}
                    placeholder="Descrição da sessão..."
                />
            </CollapsibleEditorSection>
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
                    value={description}
                    onChange={handleChange}
                    placeholder="Digite o conteúdo aqui..."
                />
            </CollapsibleEditorSection>
        </div>
    );
}

function ScopeRenderer({ block, budgetId }: CompositorRendererProps) {
    const [stats, setStats] = useState<{
        locations: number;
        sections: number;
        items: number;
    } | null>(null);
    const { setActiveTab } = useWorkspaceTab();

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
                <MapIcon className="h-5 w-5 text-primary" />
                <span className="font-bold text-sm text-primary uppercase tracking-wide">
                    ESCOPO
                </span>
            </div>
            <p className="text-sm text-muted-foreground">
                Este bloco expande o conteúdo configurado na aba Escopo
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
                Ir para aba Escopo
            </button>
        </div>
    );
}

const RENDERERS: Record<string, ComponentType<CompositorRendererProps>> = {
    cover: CoverRenderer,
    toc: TocRenderer,
    figures: FiguresRenderer,
    session: SessionRenderer,
    location: LocationRenderer,
    section: SectionRenderer,
    text: TextRenderer,
    scope: ScopeRenderer,
};

interface BlockDocumentProps {
    block: BudgetBlock;
    budgetId: string;
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    onRefresh: () => void;
    isReadOnly?: boolean;
}

function BlockDocument({
    block,
    budgetId,
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
    const isRoot = block.depth === 0;

    return (
        <div id={`block-${block.id}`}>
            {isRoot && isSession && <hr className="border-border mb-6" />}
            {isRoot && isCover && <hr className="border-border mb-6" />}
            {isRoot && isToc && <hr className="border-border mb-6" />}
            {isRoot && isFigures && <hr className="border-border mb-6" />}

            <div
                className={
                    isCover || isToc || isFigures
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
    items: Record<string, BudgetItem[]>;
    imagesByBlock: Record<string, BudgetImage[]>;
    /** Imagens do Escopo (ordem da lista de figuras). */
    scopeFigures: ScopeFigureEntry[];
    onRefresh: () => void;
    scrollRef: RefObject<HTMLDivElement | null>;
    isReadOnly?: boolean;
    /**
     * Bloco selecionado no índice — mesmo padrão do Escopo (pai = tudo abaixo, filho = só aquele ramo):
     * - `session`: essa sessão e todos os descendentes (subsessões, locais, trechos…)
     * - `location`: local + trechos
     * - `section`: só aquele trecho
     * Demais tipos ou `null` = documento completo (todas as raízes).
     */
    selectedId?: string | null;
}

export function CompositorContent({
    roots,
    budgetId,
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
            focused.type === "toc" ||
            focused.type === "figures" ||
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
