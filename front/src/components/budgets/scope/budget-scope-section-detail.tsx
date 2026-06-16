"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Layers, Copy, Trash2, Pencil, FileText, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, toAbsoluteImageUrl } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import { CompositorRichTextEditor, CollapsibleEditorSection } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { BudgetImageGallery } from "@/components/budgets/budget-image-gallery";
import { useScopeFigureNumbers } from "@/components/budgets/use-scope-figure-numbers";
import { parseFigureFrameOrientation } from "@/lib/budgets/figure-frame-utils";
import { BudgetPhotoAnnotatorDialog } from "@/components/budgets/budget-photo-annotator-dialog";
import { parseAnnotatorViewport } from "@/components/annotator/annotator-viewport-types";
import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import type { ScopeLocation, ScopeSection } from "@/actions/budget-scope-actions";
import {
    updateSectionAction,
    deleteSectionAction,
    duplicateSectionAction,
} from "@/actions/budget-hierarchy-scope-structure-actions";
import { listProductGroupsAction, type ProductGroup } from "@/actions/product-group-actions";
import { getBudgetItemsBySectionIdsLightAction } from "@/actions/budget-hierarchy-section-items-actions";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";
import { getBudgetImagesBySection, deleteBudgetImage } from "@/actions/budget-annotations";
import { loadScopeSectionPayloadCached } from "@/lib/budgets/scope-section-payload-cache";
import { formatCurrency } from "./budget-scope-utils";
import { SortableItemsList } from "./budget-scope-sortable-items-list";
import { ScopeGroupAdder, ScopeItemCreator } from "./budget-scope-item-creator";
import type { LocationAssemblyMode, PriceAdjustmentMode } from "@/lib/budgets/scope-pricing";
import {
    applyQuoteCommercialFactor,
    computeItemSubtotal,
    computeLocationAssemblyTotal,
    distributeProportional,
    sectionHasOwnAssembly,
} from "@/lib/budgets/scope-pricing";

/** True se o HTML do editor estiver vazio (só tags/brancos). */
function isRichTextContentEmpty(html: string | undefined | null): boolean {
    if (html == null || !String(html).trim()) return true;
    const text = String(html)
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    return text.length === 0;
}

interface SectionDetailProps {
    sectionId: string;
    locationId: string;
    section: ScopeSection | null;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    locations?: ScopeLocation[];
    assemblyMode?: LocationAssemblyMode;
    assemblyValue?: number;
    assemblyByItemId?: Record<string, number>;
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    /** Incrementado no pai após `loadLocations` — força recarregar itens do trecho (ex.: zerar ajustes). */
    scopeDataVersion?: number;
    /** Lista de grupos carregada uma vez no `BudgetScope` (evita N× `listProductGroupsAction`). */
    productGroups?: ProductGroup[];
    /** Editor legado: não usar cache cliente do payload do trecho. */
    disableScopePayloadCache?: boolean;
    /** Vista só-trecho: itens de todo o local (montagem) já agregados pelo pai. */
    batchedLocationItems?: BudgetItem[];
}

export function SectionDetail({
    sectionId,
    locationId,
    section,
    budgetId,
    isReadOnly,
    onRefresh,
    locations = [],
    assemblyByItemId = {},
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    scopeDataVersion = 0,
    productGroups: productGroupsFromParent,
    disableScopePayloadCache = false,
    batchedLocationItems,
}: SectionDetailProps) {
    const confirmDialog = useConfirmDialog();
    const [name, setName] = useState(section?.name ?? "");
    const [editingName, setEditingName] = useState(false);
    const [description, setDescription] = useState(section?.description ?? "");
    const [items, setItems] = useState<BudgetItem[]>([]);
    const [groups, setGroups] = useState<ProductGroup[]>(productGroupsFromParent ?? []);
    const [images, setImages] = useState<BudgetImage[]>([]);
    const [locationItems, setLocationItems] = useState<BudgetItem[]>([]);
    const [addPhotoOpen, setAddPhotoOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
    const [dupDialog, setDupDialog] = useState(false);
    const [dupName, setDupName] = useState("");
    const [dupSectioning, setDupSectioning] = useState(false);
    const [itemsLoading, setItemsLoading] = useState(true);
    const [descSectionOpen, setDescSectionOpen] = useState(() =>
        !isRichTextContentEmpty(section?.description)
    );
    const descriptionSectionRef = useRef<HTMLDivElement>(null);
    const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDescRef = useRef<string | null>(null);

    const sectionImageIdsKey = useMemo(
        () => [...images].map((i) => i.id).sort().join(","),
        [images],
    );
    const figureNumbersByImageId = useScopeFigureNumbers(budgetId, sectionImageIdsKey);

    useEffect(() => {
        setDescription(section?.description ?? "");
        pendingDescRef.current = null;
        if (descDebounce.current) clearTimeout(descDebounce.current);
    }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Ao trocar de trecho: descrição vazia → recolhido; com texto → expandido (não depende de salvamentos no mesmo trecho). */
    useEffect(() => {
        setDescSectionOpen(!isRichTextContentEmpty(section?.description));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- apenas ao mudar `sectionId`
    }, [sectionId]);

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

    useEffect(() => {
        let cancelled = false;
        setItemsLoading(true);
        void loadScopeSectionPayloadCached(scopeDataVersion, sectionId, {
            skipRead: disableScopePayloadCache,
            skipWrite: disableScopePayloadCache,
        })
            .then((res) => {
                if (cancelled) return;
                if (res.success && res.data) {
                    setItems(res.data.items);
                    setImages(res.data.images);
                } else {
                    setItems([]);
                    setImages([]);
                }
                setItemsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setItems([]);
                setImages([]);
                setItemsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [sectionId, scopeDataVersion, disableScopePayloadCache]);

    useEffect(() => {
        if (productGroupsFromParent !== undefined) {
            setGroups(productGroupsFromParent);
            return;
        }
        let cancelled = false;
        void listProductGroupsAction().then((res) => {
            if (cancelled) return;
            if (res.success && res.data) setGroups(res.data);
        });
        return () => {
            cancelled = true;
        };
    }, [productGroupsFromParent]);

    const currentLocation = useMemo(
        () => locations.find((loc) => loc.id === locationId) ?? null,
        [locations, locationId]
    );

    const sectionIdsKey = currentLocation?.sections?.map((s) => s.id).join(",") ?? "";

    useEffect(() => {
        if (batchedLocationItems !== undefined) {
            setLocationItems(batchedLocationItems);
            return;
        }
        if (!currentLocation?.sections?.length) {
            setLocationItems([]);
            return;
        }
        let cancelled = false;
        const ids = currentLocation.sections.map((s) => s.id);
        void getBudgetItemsBySectionIdsLightAction(ids).then((res) => {
            if (cancelled) return;
            if (res.success && res.data) {
                const all: BudgetItem[] = [];
                for (const sid of ids) {
                    all.push(...budgetItemsFromGroupedBySectionId(res.data, sid));
                }
                setLocationItems(all);
            } else {
                setLocationItems([]);
            }
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        batchedLocationItems,
        currentLocation?.id,
        currentLocation?.sections?.length,
        sectionIdsKey,
        scopeDataVersion,
    ]);

    const locationAssemblyModeRaw = String(
        (currentLocation as unknown as Record<string, unknown> | null)?.assembly_mode ?? "percent"
    );
    const locationAssemblyMode: LocationAssemblyMode =
        locationAssemblyModeRaw === "fixed" || locationAssemblyModeRaw === "manual"
            ? locationAssemblyModeRaw
            : "percent";
    const sectionRow = section as unknown as Record<string, unknown> | null;
    const sectionScopedAssembly = sectionHasOwnAssembly({
        assembly_mode: sectionRow?.assembly_mode as LocationAssemblyMode | undefined,
        assembly_value: sectionRow?.assembly_value as number | undefined,
    });
    const sectionAssemblyModeRaw = String(sectionRow?.assembly_mode ?? "percent");
    const sectionAssemblyMode: LocationAssemblyMode =
        sectionAssemblyModeRaw === "fixed" || sectionAssemblyModeRaw === "manual"
            ? sectionAssemblyModeRaw
            : "percent";
    const effectiveAssemblyMode = sectionScopedAssembly
        ? sectionAssemblyMode
        : locationAssemblyMode;
    const effectiveAssemblyValue = sectionScopedAssembly
        ? Number(sectionRow?.assembly_value ?? 0)
        : Number((currentLocation as unknown as Record<string, unknown> | null)?.assembly_value ?? 0);

    const effectiveAssemblyByItemId = useMemo(() => {
        if (Object.keys(assemblyByItemId).length > 0) return assemblyByItemId;
        const sourceItems = sectionScopedAssembly ? items : locationItems;
        if (!sourceItems.length) return {} as Record<string, number>;

        if (effectiveAssemblyMode === "manual") {
            const map: Record<string, number> = {};
            for (const item of sourceItems) {
                if (!item.id) continue;
                map[item.id] = Number(
                    (item as unknown as Record<string, unknown>).assembly_manual_value ?? 0
                );
            }
            return map;
        }

        const total = computeLocationAssemblyTotal(
            effectiveAssemblyMode,
            effectiveAssemblyValue,
            sourceItems
        );
        return distributeProportional(sourceItems, total);
    }, [
        assemblyByItemId,
        items,
        locationItems,
        sectionScopedAssembly,
        effectiveAssemblyMode,
        effectiveAssemblyValue,
    ]);

    const commitName = async () => {
        setEditingName(false);
        const trimmed = name
            .trim()
            .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        if (!trimmed || trimmed === section?.name) return;
        const result = await updateSectionAction(sectionId, budgetId, { name: trimmed });
        if (!result.success) toast.error(result.error || "Erro ao renomear");
        else onRefresh();
    };

    const handleDescChange = useCallback(
        (html: string) => {
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
        },
        [sectionId, budgetId, onRefresh]
    );

    const handleDeleteImage = async (image: BudgetImage) => {
        await deleteBudgetImage(image.id, budgetId);
        setImages((prev) => prev.filter((img) => img.id !== image.id));
    };

    const refreshSectionAndScope = useCallback(() => {
        setItemsLoading(true);
        void loadScopeSectionPayloadCached(scopeDataVersion, sectionId, {
            skipRead: true,
            skipWrite: disableScopePayloadCache,
        }).then((res) => {
            if (res.success && res.data) {
                setItems(res.data.items);
                setImages(res.data.images);
            }
            setItemsLoading(false);
        });
        onRefresh();
    }, [scopeDataVersion, sectionId, onRefresh, disableScopePayloadCache]);

    const totalRaw = items.reduce((sum, i) => {
        const subtotal = computeItemSubtotal(i);
        const assemblyExtra = i.id ? Number(effectiveAssemblyByItemId[i.id] ?? 0) : 0;
        return sum + subtotal + assemblyExtra;
    }, 0);
    const total = applyQuoteCommercialFactor(totalRaw, quoteMarkupPercent, quoteDiscountPercent);

    const descEmpty = isRichTextContentEmpty(description);

    const focusDescriptionSection = () => {
        setDescSectionOpen(true);
        requestAnimationFrame(() => {
            descriptionSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
    };

    if (!section) return null;

    return (
        <div className="space-y-6 bg-white rounded-md shadow-sm border-l-4 border-l-primary/40 p-5 border border-border">
            <div className="flex items-center gap-2 pb-3 border-b border-border">
                <Layers className="h-5 w-5 text-primary shrink-0" />
                {editingName && !isReadOnly ? (
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={commitName}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                            }
                            if (e.key === "Escape") {
                                setName(section.name);
                                setEditingName(false);
                            }
                        }}
                        className="text-xl font-bold border-b border-primary outline-none bg-transparent flex-1"
                    />
                ) : (
                    <button
                        type="button"
                        className={cn(
                            "group flex items-center gap-1.5 flex-1 text-left",
                            !isReadOnly && "hover:text-primary transition-colors"
                        )}
                        onClick={() => {
                            if (!isReadOnly) {
                                setName(section.name);
                                setEditingName(true);
                            }
                        }}
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
                            type="button"
                            title="Duplicar trecho"
                            onClick={() => {
                                setDupName(`${section.name} - Cópia`);
                                setDupDialog(true);
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            title="Excluir trecho"
                            onClick={async () => {
                                const ok = await confirmDialog({
                                    title: "Remover trecho",
                                    description: "Remover este trecho e seus itens?",
                                    confirmLabel: "Remover",
                                    destructive: true,
                                });
                                if (!ok) return;
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
                        <Button variant="outline" type="button" onClick={() => setDupDialog(false)}>
                            Cancelar
                        </Button>
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

            <CollapsibleEditorSection label="Fotos do trecho">
                <BudgetImageGallery
                    images={images}
                    figureNumbersByImageId={figureNumbersByImageId}
                    onAdd={() => { if (!isReadOnly) setAddPhotoOpen(true); }}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto."
                />
            </CollapsibleEditorSection>

            <CollapsibleEditorSection
                label="Produtos"
                rightContent={!itemsLoading && items.length > 0 ? formatCurrency(total) : undefined}
            >
                {itemsLoading ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                        <span className="text-sm">A carregar itens…</span>
                    </div>
                ) : (
                    <>
                        {items.length > 0 && (
                            <div className="grid grid-cols-12 gap-2 px-2 py-1 text-xs text-muted-foreground font-medium">
                                <div className="col-span-3">Produto</div>
                                <div className="col-span-2 text-center">Qtd / un.</div>
                                <div className="col-span-1 text-right">Equipto.</div>
                                <div className="col-span-2 text-right">Ajuste de Preço</div>
                                <div className="col-span-1 text-right">MO unit.</div>
                                <div className="col-span-1 text-right">Total</div>
                                <div className="col-span-2" />
                            </div>
                        )}
                        <SortableItemsList
                            items={items}
                            budgetId={budgetId}
                            isReadOnly={isReadOnly}
                            onRefresh={refreshSectionAndScope}
                            groups={groups}
                            assemblyMode={effectiveAssemblyMode}
                            assemblyByItemId={effectiveAssemblyByItemId}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                        />
                    </>
                )}
                {!isReadOnly && (
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                        <ScopeItemCreator
                            sectionId={sectionId}
                            budgetId={budgetId}
                            onSuccess={refreshSectionAndScope}
                        />
                        <ScopeGroupAdder
                            sectionId={sectionId}
                            budgetId={budgetId}
                            onSuccess={refreshSectionAndScope}
                        />
                        <Button
                            type="button"
                            variant="default"
                            size="sm"
                            className="h-8 w-full gap-1.5 text-xs sm:w-auto shrink-0"
                            onClick={focusDescriptionSection}
                        >
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            {descEmpty ? "Adicionar descrição" : "Editar descrição"}
                        </Button>
                    </div>
                )}
            </CollapsibleEditorSection>

            <div ref={descriptionSectionRef} id="budget-scope-section-description">
                <CollapsibleEditorSection
                    label="Descrição do trecho"
                    open={descSectionOpen}
                    onOpenChange={setDescSectionOpen}
                >
                    <CompositorRichTextEditor
                    key={sectionId}
                    value={description}
                    onChange={handleDescChange}
                    placeholder="Descreva o trecho..."
                />
                </CollapsibleEditorSection>
            </div>

            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                sectionId={sectionId}
                availableItems={items}
                open={addPhotoOpen}
                onOpenChange={setAddPhotoOpen}
                onSaved={() => {
                    setAddPhotoOpen(false);
                    getBudgetImagesBySection(sectionId).then((imgs) =>
                        setImages(imgs as unknown as BudgetImage[])
                    );
                }}
            />
            {editingImage && (
                <BudgetPhotoAnnotatorDialog
                    budgetId={budgetId}
                    sectionId={sectionId}
                    imageId={editingImage.id}
                    availableItems={items}
                    initialImageUrl={toAbsoluteImageUrl(editingImage.url || editingImage.composed_url) ?? null}
                    initialAnnotations={
                        (editingImage.annotations ?? []) as unknown as Parameters<
                            typeof BudgetPhotoAnnotatorDialog
                        >[0]["initialAnnotations"]
                    }
                    initialEditorViewport={parseAnnotatorViewport(editingImage.editor_viewport)}
                    initialCaption={editingImage.caption ?? ""}
                    initialFigureFrameOrientation={
                        parseFigureFrameOrientation(editingImage.figure_frame_orientation) ?? null
                    }
                    open={!!editingImage}
                    onOpenChange={(open) => { if (!open) setEditingImage(null); }}
                    onSaved={() => {
                        setEditingImage(null);
                        getBudgetImagesBySection(sectionId).then((imgs) =>
                            setImages(imgs as unknown as BudgetImage[])
                        );
                    }}
                />
            )}
        </div>
    );
}
