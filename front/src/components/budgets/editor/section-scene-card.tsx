"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { BudgetSection, BudgetImage } from "@/types/budget-types";
import type { ImageAnnotation } from "@/components/annotator/tools/types";
import { InlineItemCreator } from "./inline-item-creator";
import { AddGroupDialog } from "./add-group-dialog";
import { BudgetImageGallery } from "../budget-image-gallery";
import { BudgetPhotoAnnotatorDialog } from "../budget-photo-annotator-dialog";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { EditableTitle } from "./editable-title";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight, Copy, Layers, Save, Trash2, X } from "lucide-react";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { toast } from "@/lib/toast";

import type { BudgetItem } from "@/types/budget-types";

interface ItemQuantityRowProps {
    item: BudgetItem;
    onDelete: (id: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
    formatCurrency: (val: number) => string;
}

function ItemQuantityRow({ item, onDelete, onUpdateQuantity, formatCurrency }: ItemQuantityRowProps) {
    const [qty, setQty] = useState(item.quantity);
    const [saving, setSaving] = useState(false);

    // Padrão React: atualiza estado derivado durante o render quando props mudam
    const [prevQty, setPrevQty] = useState(item.quantity);
    if (prevQty !== item.quantity) {
        setPrevQty(item.quantity);
        setQty(item.quantity);
    }

    const handleQtyCommit = async () => {
        if (qty === item.quantity || qty < 1) return;
        setSaving(true);
        await onUpdateQuantity(item.id!, qty);
        setSaving(false);
    };

    const unit = typeof item.product_id === "object" ? item.product_id.unit : "";

    return (
        <div className="grid grid-cols-12 gap-2 items-center p-2 bg-white rounded-md border text-sm hover:shadow-sm transition-shadow">
            {/* Produto */}
            <div className="col-span-12 md:col-span-5 font-medium truncate">
                {typeof item.product_id === "object" ? item.product_id.description : "Produto Indefinido"}
            </div>
            {/* Quantidade */}
            <div className="col-span-4 md:col-span-2 flex items-center justify-center gap-1">
                <input
                    type="number"
                    min={1}
                    value={qty}
                    disabled={saving}
                    onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                    onBlur={handleQtyCommit}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className="w-14 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                />
                {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </div>
            {/* MO (R$) — somente leitura, copiado do produto */}
            <div className="hidden md:block md:col-span-2 text-right text-muted-foreground">
                {formatCurrency(item.labor_cost ?? 0)}
            </div>
            {/* Preço unitário equipamento */}
            <div className="hidden md:block md:col-span-1 text-right text-muted-foreground">
                {formatCurrency(item.unit_price)}
            </div>
            {/* Total */}
            <div className="col-span-4 md:col-span-1 text-right font-semibold">
                {formatCurrency(item.total)}
            </div>
            {/* Excluir */}
            <div className="col-span-4 md:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/50 hover:text-destructive" onClick={() => item.id && onDelete(item.id)}>
                    <X className="w-3 h-3" />
                </Button>
            </div>
        </div>
    );
}

interface ItemsListProps {
    items: BudgetItem[];
    onDelete: (id: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => Promise<void>;
    formatCurrency: (val: number) => string;
}

function ItemsList({ items, onDelete, onUpdateQuantity, formatCurrency }: ItemsListProps) {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (groupId: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    // Separa itens avulsos de itens de grupo; agrupa por group_id
    const { standalone, groups } = useMemo(() => {
        const standalone: BudgetItem[] = [];
        const groupMap = new Map<string, { name: string; items: BudgetItem[] }>();

        for (const item of items) {
            if (item.group_id) {
                if (!groupMap.has(item.group_id)) {
                    groupMap.set(item.group_id, { name: item.group_name ?? item.group_id, items: [] });
                }
                groupMap.get(item.group_id)!.items.push(item);
            } else {
                standalone.push(item);
            }
        }

        return { standalone, groups: Array.from(groupMap.entries()) };
    }, [items]);

    return (
        <>
            {/* Itens avulsos */}
            {standalone.map((item) => (
                <ItemQuantityRow
                    key={item.id}
                    item={item}
                    onDelete={onDelete}
                    onUpdateQuantity={onUpdateQuantity}
                    formatCurrency={formatCurrency}
                />
            ))}

            {/* Grupos (accordion) */}
            {groups.map(([groupId, group]) => {
                const isExpanded = expandedGroups.has(groupId);
                const groupTotal = group.items.reduce((sum, i) => sum + (i.total ?? 0), 0);
                const itemCount = group.items.length;

                return (
                    <div key={groupId} className="border rounded-md overflow-hidden">
                        {/* Linha do grupo */}
                        <button
                            type="button"
                            onClick={() => toggleGroup(groupId)}
                            className="w-full grid grid-cols-12 gap-2 items-center px-2 py-2 bg-muted/40 hover:bg-muted/60 transition-colors text-sm"
                        >
                            <div className="col-span-12 md:col-span-5 flex items-center gap-2 text-left font-medium">
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
                                <Layers className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{group.name}</span>
                                <span className="text-xs text-muted-foreground font-normal">({itemCount} produto{itemCount !== 1 ? "s" : ""})</span>
                            </div>
                            <div className="col-span-4 md:col-span-2" />
                            <div className="hidden md:block md:col-span-2" />
                            <div className="hidden md:block md:col-span-1" />
                            <div className="col-span-4 md:col-span-1 text-right font-semibold">
                                {formatCurrency(groupTotal)}
                            </div>
                            <div className="col-span-4 md:col-span-1" />
                        </button>

                        {/* Produtos do grupo */}
                        {isExpanded && (
                            <div className="space-y-px pl-4 pr-1 py-1 bg-muted/10">
                                {group.items.map((item) => (
                                    <ItemQuantityRow
                                        key={item.id}
                                        item={item}
                                        onDelete={onDelete}
                                        onUpdateQuantity={onUpdateQuantity}
                                        formatCurrency={formatCurrency}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </>
    );
}

interface SectionSceneCardProps {
    section: BudgetSection;
    budget_id: string;
    sectionNumber?: string; // ex: "5.1.2"
    onRefresh: () => void;
}

export function SectionSceneCard({ section, budget_id, sectionNumber, onRefresh }: SectionSceneCardProps) {
    const repo = useBudgetsRepository();
    const [addPhotoOpen, setAddPhotoOpen] = useState(false);
    const [editingImage, setEditingImage] = useState<BudgetImage | null>(null);
    const [notesOpen, setNotesOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Estado local da descrição: sobrevive ao remount do RichTextEditor
    // (que acontece quando notesOpen alterna)
    const [currentDescription, setCurrentDescription] = useState(section.description || "");
    const [isDirty, setIsDirty] = useState(false);
    const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
    const pendingHtmlRef = useRef<string | null>(null);

    const sectionId = section.id as string;
    const hasNotes = useMemo(() => {
        const desc = currentDescription;
        return desc !== "" && desc !== "<p></p>";
    }, [currentDescription]);
    const images: BudgetImage[] = section.images || [];
    const items = section.items || [];

    // Sincroniza quando um trecho diferente é renderizado com o mesmo componente
    useEffect(() => {
        setCurrentDescription(section.description || "");
        setIsDirty(false);
        pendingHtmlRef.current = null;
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, [section.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Flush de segurança: cancela debounce e salva conteúdo pendente
    // quando o card desmonta OU quando o trecho muda (sectionId troca)
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (pendingHtmlRef.current !== null) {
                repo.updateSection(sectionId, budget_id, { description: pendingHtmlRef.current });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sectionId]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const handleDescriptionChange = useCallback((html: string) => {
        setCurrentDescription(html);
        setIsDirty(true);
        pendingHtmlRef.current = html;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const res = await repo.updateSection(sectionId, budget_id, { description: html });
            if (res.success) {
                setIsDirty(false);
                pendingHtmlRef.current = null;
            } else {
                toast.error(res.error || "Erro ao salvar descrição");
            }
        }, 1500);
    }, [sectionId, budget_id, repo]);

    const handleSaveDescription = useCallback(async () => {
        if (pendingHtmlRef.current === null) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const html = pendingHtmlRef.current;
        const res = await repo.updateSection(sectionId, budget_id, { description: html });
        if (res.success) {
            setIsDirty(false);
            pendingHtmlRef.current = null;
        } else {
            toast.error(res.error || "Erro ao salvar descrição");
        }
    }, [sectionId, budget_id, repo]);


    const handleNameSave = useCallback(async (newName: string) => {
        const res = await repo.updateSection(sectionId, budget_id, { name: newName });
        if (res.success) {
            onRefresh();
        } else {
            toast.error(res.error || "Erro ao renomear trecho");
        }
    }, [sectionId, budget_id, repo, onRefresh]);

    const handleDeleteItem = async (itemId: string) => {
        if (!confirm("Excluir item?")) return;
        try {
            if (!itemId) return;
            await repo.deleteItem(itemId, budget_id);
            onRefresh();
            toast.success("Item removido");
        } catch {
            toast.error("Erro ao remover item");
        }
    };

    const handleUpdateQuantity = useCallback(async (itemId: string, quantity: number) => {
        if (quantity < 1) return;
        const res = await repo.updateItemQuantity(itemId, budget_id, quantity);
        if (res.success) {
            onRefresh();
        } else {
            toast.error(res.error || "Erro ao atualizar quantidade");
        }
    }, [repo, budget_id, onRefresh]);

    const handleDeleteSection = async () => {
        if (!confirm("Excluir todo este trecho e seus itens?")) return;
        try {
            await repo.deleteSection(sectionId, budget_id);
            onRefresh();
            toast.success("Trecho removido");
        } catch {
            toast.error("Erro ao remover trecho");
        }
    };

    const handleDuplicateSection = async () => {
        const res = await repo.duplicateSection(sectionId, budget_id);
        if (res.success) {
            onRefresh();
            toast.success("Trecho duplicado");
            if (res.newSectionId) {
                const targetId = res.newSectionId;
                setTimeout(() => {
                    document.querySelector(`[data-section-id="${targetId}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 400);
            }
        } else {
            toast.error(res.error || "Erro ao duplicar trecho");
        }
    };

    const handleDeleteImage = async (image: BudgetImage) => {
        try {
            const res = await repo.deleteBudgetImage(image.id, budget_id);
            if (res.success) {
                onRefresh();
                toast.success("Foto excluída");
            } else {
                toast.error(res.error || "Erro ao excluir foto");
            }
        } catch {
            toast.error("Erro ao excluir foto");
        }
    };

    return (
        <Card data-section-id={sectionId} className="p-4 mb-4 border-l-4 border-l-primary/40">
            {/* Header do Trecho */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    {sectionNumber && (
                        <span className="text-sm font-mono text-muted-foreground shrink-0">{sectionNumber}</span>
                    )}
                    <EditableTitle
                        value={section.name}
                        onSave={handleNameSave}
                        className="text-lg font-semibold"
                    />
                </div>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={handleDuplicateSection} className="text-muted-foreground hover:text-foreground" title="Duplicar trecho">
                        <Copy className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={handleDeleteSection} className="text-destructive">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Observações do Trecho */}
            <div className="mb-4">
                <button
                    type="button"
                    onClick={() => setNotesOpen((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground uppercase hover:text-foreground transition-colors"
                >
                    {notesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    Observações
                    {hasNotes && !notesOpen && <span className="ml-1 text-xs normal-case text-primary">(preenchido)</span>}
                </button>
                {notesOpen && (
                    <div className="mt-2 space-y-2">
                        <RichTextEditor
                            key={sectionId}
                            value={currentDescription}
                            onChange={handleDescriptionChange}
                            placeholder="Observações sobre o trecho..."
                        />
                        {isDirty && (
                            <div className="flex justify-end">
                                <Button size="sm" variant="default" onClick={handleSaveDescription}>
                                    <Save className="w-3 h-3 mr-1.5" />
                                    Salvar observações
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Fotos / Cenas do Trecho */}
            <div className="mb-4 space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground uppercase">Fotos / Cenas</h4>
                <BudgetImageGallery
                    images={images}
                    onAdd={() => setAddPhotoOpen(true)}
                    onEdit={(img) => setEditingImage(img)}
                    onDelete={handleDeleteImage}
                    emptyMessage="Nenhuma foto do trecho. Clique em Adicionar Cena para compor."
                    addButtonLabel="Adicionar Cena"
                />

                <BudgetPhotoAnnotatorDialog
                    budgetId={budget_id}
                    sectionId={sectionId}
                    availableItems={items}
                    open={addPhotoOpen}
                    onOpenChange={setAddPhotoOpen}
                    onRefresh={onRefresh}
                    onSaved={() => {
                        setAddPhotoOpen(false);
                        onRefresh();
                    }}
                />

                <BudgetPhotoAnnotatorDialog
                    budgetId={budget_id}
                    sectionId={sectionId}
                    imageId={editingImage?.id}
                    availableItems={items}
                    initialImageUrl={(() => {
                        const raw = editingImage?.url || editingImage?.composed_url;
                        return raw ? (typeof window !== "undefined" ? new URL(raw, window.location.origin).href : raw) : null;
                    })()}
                    initialAnnotations={(editingImage?.annotations ?? []) as unknown as ImageAnnotation[]}
                    open={!!editingImage}
                    onOpenChange={(open) => !open && setEditingImage(null)}
                    onRefresh={onRefresh}
                    onSaved={() => {
                        setEditingImage(null);
                        onRefresh();
                    }}
                />
            </div>

            {/* Lista de Itens */}
            <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground uppercase">Itens</h4>

                {/* Header Tabela */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground uppercase px-2">
                    <div className="col-span-12 md:col-span-5">Produto</div>
                    <div className="col-span-4 md:col-span-2 text-center">Qtd</div>
                    <div className="hidden md:block md:col-span-2 text-right">MO (R$)</div>
                    <div className="hidden md:block md:col-span-1 text-right">Unit</div>
                    <div className="col-span-4 md:col-span-1 text-right">Total</div>
                    <div className="col-span-4 md:col-span-1"></div>
                </div>

                {/* Lista Existente */}
                <div className="space-y-1">
                    {items.length === 0 && (
                        <div className="text-sm text-muted-foreground py-4 text-center italic">
                            Nenhum item neste trecho.
                        </div>
                    )}
                    <ItemsList
                        items={items}
                        onDelete={handleDeleteItem}
                        onUpdateQuantity={handleUpdateQuantity}
                        formatCurrency={formatCurrency}
                    />
                </div>

                {/* Inline Creator com budgetId */}
                <div className="mt-4 pt-2 border-t space-y-2">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-xs font-medium text-muted-foreground">Adicionar:</span>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => setIsAddGroupDialogOpen(true)}
                        >
                            <Layers className="w-3 h-3" />
                            Adicionar Grupo
                        </Button>
                        <AddGroupDialog
                            open={isAddGroupDialogOpen}
                            onOpenChange={setIsAddGroupDialogOpen}
                            sectionId={sectionId}
                            budgetId={budget_id}
                            onSuccess={onRefresh}
                            addGroupToSection={(s, b, gId, gName, qtys, ids) => repo.addGroupToSection(s, b, gId, gName, qtys, ids)}
                        />
                    </div>
                    <InlineItemCreator sectionId={sectionId} budgetId={budget_id} onSuccess={onRefresh} />
                </div>
            </div>
        </Card>
    );
}
