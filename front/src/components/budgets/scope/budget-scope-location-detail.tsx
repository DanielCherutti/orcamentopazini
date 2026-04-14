"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Map as MapIcon, Copy, Trash2, Pencil } from "lucide-react";
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
import { CompositorRichTextEditor, CollapsibleEditorSection } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { BudgetImageGallery } from "@/components/budgets/budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "@/components/budgets/budget-photo-annotator-dialog";
import { parseAnnotatorViewport } from "@/components/annotator/annotator-viewport-types";
import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import type { ScopeLocation } from "@/actions/budget-scope-actions";
import { getBudgetItemsBySectionIdsLightAction } from "@/actions/budget-hierarchy-section-items-actions";
import { budgetItemsFromGroupedBySectionId } from "@/lib/budgets/budget-section-items-grouped";
import {
    updateLocationAction,
    deleteLocationAction,
    duplicateLocationAction,
} from "@/actions/budget-hierarchy-scope-structure-actions";
import { getBudgetImagesByLocation, deleteBudgetImage } from "@/actions/budget-annotations";
import { SectionDetail } from "./budget-scope-section-detail";
import { useScopeFigureNumbers } from "@/components/budgets/use-scope-figure-numbers";
import { parseFigureFrameOrientation } from "@/lib/budgets/figure-frame-utils";
import {
    computeLocationAssemblyTotal,
    distributeProportional,
    type LocationAssemblyMode,
    type PriceAdjustmentMode,
} from "@/lib/budgets/scope-pricing";
import type { ProductGroup } from "@/actions/product-group-actions";

interface LocationDetailProps {
    locationId: string;
    location: ScopeLocation | null;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    /** Lista completa de locais (repassada aos trechos quando necessário). */
    locations?: ScopeLocation[];
    priceAdjustmentEnabled: boolean;
    priceAdjustmentInputMode: PriceAdjustmentMode;
    quoteMarkupPercent?: number;
    quoteDiscountPercent?: number;
    /** Incrementado no pai após `loadLocations` — recarrega itens do local nos trechos. */
    scopeDataVersion?: number;
    /** Grupos de produto carregados uma vez no `BudgetScope`. */
    productGroups?: ProductGroup[];
}

export function LocationDetail({
    locationId,
    location,
    budgetId,
    isReadOnly,
    onRefresh,
    locations = [],
    priceAdjustmentEnabled,
    priceAdjustmentInputMode,
    quoteMarkupPercent = 0,
    quoteDiscountPercent = 0,
    scopeDataVersion = 0,
    productGroups,
}: LocationDetailProps) {
    const [name, setName] = useState(location?.name ?? "");
    const [editingName, setEditingName] = useState(false);
    const [dupDialog, setDupDialog] = useState(false);
    const [dupName, setDupName] = useState("");
    const [dupLocating, setDupLocating] = useState(false);
    const [description, setDescription] = useState(location?.description ?? "");
    const [images, setImages] = useState<BudgetImage[]>([]);
    const [itemsBySection, setItemsBySection] = useState<Record<string, BudgetItem[]> | null>(null);
    const [addPhotoOpen, setAddPhotoOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
    const [assemblyMode, setAssemblyMode] = useState<LocationAssemblyMode>(
        (location as unknown as Record<string, unknown>)?.assembly_mode === "fixed" ||
            (location as unknown as Record<string, unknown>)?.assembly_mode === "manual"
            ? ((location as unknown as Record<string, unknown>)
                  .assembly_mode as LocationAssemblyMode)
            : "percent"
    );
    const [assemblyValue, setAssemblyValue] = useState<number>(
        Number((location as unknown as Record<string, unknown>)?.assembly_value ?? 0)
    );

    const imageIdsRefreshKey = useMemo(
        () => [...images].map((i) => i.id).sort().join(","),
        [images],
    );
    const figureNumbersByImageId = useScopeFigureNumbers(budgetId, imageIdsRefreshKey);

    const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        getBudgetImagesByLocation(locationId).then((imgs) =>
            setImages(imgs as unknown as BudgetImage[])
        );
    }, [locationId]);

    useEffect(() => {
        const modeRaw = String(
            (location as unknown as Record<string, unknown>)?.assembly_mode ?? "percent"
        );
        const mode: LocationAssemblyMode =
            modeRaw === "fixed" || modeRaw === "manual" ? modeRaw : "percent";
        setAssemblyMode(mode);
        setAssemblyValue(
            Number((location as unknown as Record<string, unknown>)?.assembly_value ?? 0)
        );
    }, [location]);

    const sectionIdsKey = location?.sections?.map((s) => s.id).join(",") ?? "";

    useEffect(() => {
        if (!location?.sections?.length) {
            setItemsBySection({});
            return;
        }
        let cancelled = false;
        setItemsBySection(null);
        const ids = location.sections.map((s) => s.id);
        getBudgetItemsBySectionIdsLightAction(ids).then((res) => {
            if (cancelled) return;
            setItemsBySection(res.success && res.data ? res.data : {});
        });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location?.id, location?.sections?.length, sectionIdsKey, scopeDataVersion]);

    const locationItems = useMemo(() => {
        if (!itemsBySection || !location?.sections?.length) return [];
        return location.sections.flatMap((s) =>
            budgetItemsFromGroupedBySectionId(itemsBySection, s.id)
        );
    }, [itemsBySection, location?.sections]);

    const commitName = async () => {
        setEditingName(false);
        const trimmed = name.trim().toUpperCase();
        if (!trimmed || trimmed === location?.name) return;
        const result = await updateLocationAction(locationId, budgetId, { name: trimmed });
        if (!result.success) toast.error(result.error || "Erro ao renomear");
        else onRefresh();
    };

    const handleDescChange = useCallback(
        (html: string) => {
            setDescription(html);
            if (descDebounce.current) clearTimeout(descDebounce.current);
            descDebounce.current = setTimeout(async () => {
                await updateLocationAction(locationId, budgetId, { description: html });
            }, 1500);
        },
        [locationId, budgetId]
    );

    const handleDeleteImage = async (image: BudgetImage) => {
        await deleteBudgetImage(image.id, budgetId);
        setImages((prev) => prev.filter((img) => img.id !== image.id));
    };

    const assemblyByItemId = useMemo(() => {
        if (!locationItems.length) return {} as Record<string, number>;
        if (assemblyMode === "manual") {
            const map: Record<string, number> = {};
            for (const item of locationItems) {
                if (!item.id) continue;
                map[item.id] = Number(
                    (item as unknown as Record<string, unknown>).assembly_manual_value ?? 0
                );
            }
            return map;
        }
        const total = computeLocationAssemblyTotal(assemblyMode, assemblyValue, locationItems);
        return distributeProportional(locationItems, total);
    }, [assemblyMode, assemblyValue, locationItems]);

    if (!location) return null;

    return (
        <div className="space-y-6 bg-primary/[0.03] rounded-lg p-5 border border-primary/20 shadow-sm">
            <div className="flex items-center gap-2 pb-3 border-b-2 border-primary/50">
                <MapIcon className="h-5 w-5 text-primary shrink-0" />
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
                                setName(location.name);
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
                                setName(location.name);
                                setEditingName(true);
                            }
                        }}
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
                            type="button"
                            title="Duplicar local"
                            onClick={() => {
                                setDupName(`${location.name} - Cópia`);
                                setDupDialog(true);
                            }}
                            className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
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
                        <Button variant="outline" type="button" onClick={() => setDupDialog(false)}>
                            Cancelar
                        </Button>
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

            <CollapsibleEditorSection label="Fotos do local">
                <BudgetImageGallery
                    images={images}
                    figureNumbersByImageId={figureNumbersByImageId}
                    onAdd={() => { if (!isReadOnly) setAddPhotoOpen(true); }}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto."
                />
            </CollapsibleEditorSection>

            <CollapsibleEditorSection label="Descrição do local" defaultOpen={false}>
                <CompositorRichTextEditor
                    key={locationId}
                    value={description}
                    onChange={handleDescChange}
                    placeholder="Descreva o local..."
                />
            </CollapsibleEditorSection>

            {location.sections.length > 0 && (
                <div className="space-y-6 pt-2">
                    {itemsBySection === null && (
                        <p className="text-xs text-muted-foreground px-1">
                            A carregar itens do local para montagem e totais…
                        </p>
                    )}
                    {location.sections.map((sec) => (
                        <SectionDetail
                            key={sec.id}
                            sectionId={sec.id}
                            locationId={locationId}
                            section={sec}
                            budgetId={budgetId}
                            isReadOnly={isReadOnly}
                            onRefresh={onRefresh}
                            locations={locations.length > 0 ? locations : [location]}
                            assemblyMode={assemblyMode}
                            assemblyByItemId={assemblyByItemId}
                            priceAdjustmentEnabled={priceAdjustmentEnabled}
                            priceAdjustmentInputMode={priceAdjustmentInputMode}
                            quoteMarkupPercent={quoteMarkupPercent}
                            quoteDiscountPercent={quoteDiscountPercent}
                            scopeDataVersion={scopeDataVersion}
                            productGroups={productGroups}
                            batchedLocationItems={locationItems}
                        />
                    ))}
                </div>
            )}

            <BudgetPhotoAnnotatorDialog
                budgetId={budgetId}
                locationId={locationId}
                availableItems={locationItems}
                open={addPhotoOpen}
                onOpenChange={setAddPhotoOpen}
                onSaved={() => {
                    setAddPhotoOpen(false);
                    getBudgetImagesByLocation(locationId).then((imgs) =>
                        setImages(imgs as unknown as BudgetImage[])
                    );
                }}
            />
            {editingImage && (
                <BudgetPhotoAnnotatorDialog
                    budgetId={budgetId}
                    locationId={locationId}
                    imageId={editingImage.id}
                    availableItems={locationItems}
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
                        getBudgetImagesByLocation(locationId).then((imgs) =>
                            setImages(imgs as unknown as BudgetImage[])
                        );
                    }}
                />
            )}
        </div>
    );
}
