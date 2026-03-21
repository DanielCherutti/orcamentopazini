"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Layers, Copy, Trash2, Pencil } from "lucide-react";
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
import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import type { ScopeLocation, ScopeSection } from "@/actions/budget-scope-actions";
import type { ProductGroup } from "@/actions/product-group-actions";
import {
    getItemsBySectionAction,
    updateSectionAction,
    deleteSectionAction,
    duplicateSectionAction,
} from "@/actions/budget-hierarchy-actions";
import { listProductGroupsAction } from "@/actions/product-group-actions";
import { getBudgetImagesBySection, deleteBudgetImage } from "@/actions/budget-annotations";
import { formatCurrency } from "./budget-scope-utils";
import { SortableItemsList } from "./budget-scope-sortable-items-list";
import { ScopeGroupAdder, ScopeItemCreator } from "./budget-scope-item-creator";

interface SectionDetailProps {
    sectionId: string;
    locationId: string;
    section: ScopeSection | null;
    budgetId: string;
    isReadOnly: boolean;
    onRefresh: () => void;
    locations?: ScopeLocation[];
}

export function SectionDetail({
    sectionId,
    locationId: _locationId,
    section,
    budgetId,
    isReadOnly,
    onRefresh,
    locations: _locations = [],
}: SectionDetailProps) {
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

    useEffect(() => {
        setDescription(section?.description ?? "");
        pendingDescRef.current = null;
        if (descDebounce.current) clearTimeout(descDebounce.current);
    }, [sectionId]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const total = items.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

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
                    onAdd={() => { if (!isReadOnly) setAddPhotoOpen(true); }}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto."
                />
            </CollapsibleEditorSection>

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
