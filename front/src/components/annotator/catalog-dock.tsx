"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { GripVertical, ChevronRight, ChevronDown, Loader2, Search, Plus, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { BudgetItem } from "@/types/budget-types";
import { getProductsAction, Product } from "@/actions/product-actions";
import { listProductGroupsWithProductsAction, getProductGroupProductsAction, ProductGroup } from "@/actions/product-group-actions";
import { canonicalTableRecordId } from "@/lib/surreal-record-ids";

interface CatalogDockProps {
    availableItems: BudgetItem[];
    onDragStartBudgetItem: (e: React.DragEvent, item: BudgetItem) => void;
    onDragStartCatalogProduct: (e: React.DragEvent, product: Product) => void;
    onDragStartCatalogGroup?: (e: React.DragEvent, group: ProductGroup) => void;
    /**
     * Com `budgetId`: IDs de grupo usados nos itens do documento (filtra a árvore de grupos).
     * `undefined` = sem filtro (ex.: demo). Enquanto `budgetUsedGroupIdsLoading`, a lista ainda não está pronta.
     */
    budgetUsedGroupIds?: string[];
    budgetUsedGroupIdsLoading?: boolean;
    /** Quando true (toolbar), lista a aba Grupo com todos os grupos do catálogo, não só os usados no documento. */
    showAllProductGroups?: boolean;
    /** Incrementado pela toolbar: vai à aba Grupo e expande/carrega conforme a lista visível (filtrada ou completa). */
    expandAllGroupsSignal?: number;
}

type GroupProduct = {
    id: string;
    code: string;
    description: string;
    unit: string;
    equipmentPrice: number;
    assemblyPrice: number;
    imageUrl?: string;
};

function ProductCard({ name, imageUrl, unit, hint, onDragStart }: {
    name: string;
    imageUrl?: string;
    /** Unidade de venda (ex.: m², un) — exibida ao lado do nome ao adicionar/arrastar. */
    unit?: string;
    hint: string;
    onDragStart: (e: React.DragEvent) => void;
}) {
    const u = unit?.trim();
    return (
        <button
            type="button"
            draggable
            onDragStart={onDragStart}
            className={cn(
                "w-full text-left rounded-lg border border-border bg-background p-3 shadow-sm",
                "cursor-grab active:cursor-grabbing transition-all",
                "hover:border-primary/55 hover:bg-primary/5 hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-primary/40",
                "group"
            )}
        >
            <div className="flex gap-3">
                <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/80">
                    {imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                            src={imageUrl}
                            alt=""
                            draggable={false}
                            className="w-full h-full object-cover pointer-events-none select-none"
                        />
                    ) : (
                        <Package className="w-5 h-5 text-muted-foreground" aria-hidden />
                    )}
                </div>
                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-3 break-words">
                        {name}
                    </p>
                    {u ? (
                        <p className="text-xs text-muted-foreground" title={u}>
                            {u}
                        </p>
                    ) : null}
                    <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-primary">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm shrink-0">
                            <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                        </span>
                        <span className="leading-tight">{hint}</span>
                    </div>
                </div>
                <GripVertical
                    className="h-4 w-4 shrink-0 text-muted-foreground/60 group-hover:text-primary/70 mt-1"
                    aria-hidden
                />
            </div>
        </button>
    );
}

function productGroupKey(id: string): string {
    const c = canonicalTableRecordId("product_group", id);
    return c.startsWith("product_group:") ? c.slice("product_group:".length) : c;
}

function groupIdInAllowlist(groupId: string, allowlist: string[]): boolean {
    const gKey = productGroupKey(groupId);
    return allowlist.some((id) => productGroupKey(id) === gKey);
}

export function CatalogDock({
    availableItems,
    onDragStartBudgetItem,
    onDragStartCatalogProduct,
    onDragStartCatalogGroup,
    budgetUsedGroupIds,
    budgetUsedGroupIdsLoading = false,
    showAllProductGroups = false,
    expandAllGroupsSignal = 0,
}: CatalogDockProps) {
    const [activeTab, setActiveTab] = useState<"budget" | "groups">(() =>
        availableItems.length > 0 ? "budget" : "groups"
    );

    // Estado do catálogo
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);

    // Estado dos grupos
    const [groups, setGroups] = useState<ProductGroup[]>([]);
    const [groupsLoaded, setGroupsLoaded] = useState(false);
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
    const [groupProducts, setGroupProducts] = useState<Record<string, GroupProduct[]>>({});
    const [loadingGroupIds, setLoadingGroupIds] = useState<Set<string>>(() => new Set());

    // Carregar grupos ao abrir aba catálogo
    const loadGroups = useCallback(async () => {
        if (groupsLoaded) return;
        const res = await listProductGroupsWithProductsAction();
        if (res.success && res.data) {
            setGroups(res.data);
        }
        setGroupsLoaded(true);
    }, [groupsLoaded]);

    // Busca debounced
    const debouncedSearch = useDebouncedCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const res = await getProductsAction({ query, limit: 40, page: 1 });
        if (res.success && res.data) {
            setSearchResults(res.data);
        }
        setSearching(false);
    }, 300);

    const handleSearchChange = (value: string) => {
        setSearchQuery(value);
        if (!value.trim()) {
            setSearchResults([]);
            setSearching(false);
        } else {
            setSearching(true);
            debouncedSearch(value);
        }
    };

    // Expandir / recolher grupo e carregar produtos sob demanda
    const toggleGroup = async (groupId: string) => {
        const isOpen = expandedGroupIds.has(groupId);
        if (isOpen) {
            setExpandedGroupIds((prev) => {
                const n = new Set(prev);
                n.delete(groupId);
                return n;
            });
            return;
        }
        setExpandedGroupIds((prev) => new Set([...prev, groupId]));
        if (groupProducts[groupId]) return;
        setLoadingGroupIds((prev) => new Set(prev).add(groupId));
        try {
            const res = await getProductGroupProductsAction(groupId);
            if (res.success && res.data) {
                setGroupProducts((prev) => ({ ...prev, [groupId]: res.data as GroupProduct[] }));
            }
        } finally {
            setLoadingGroupIds((prev) => {
                const n = new Set(prev);
                n.delete(groupId);
                return n;
            });
        }
    };

    const handleTabChange = (value: string) => {
        const v = value as "budget" | "groups";
        setActiveTab(v);
        if (v === "groups") loadGroups();
    };

    useEffect(() => {
        if (activeTab === "groups") loadGroups();
    }, [activeTab, loadGroups]);

    // Toolbar do anotador: aba Grupo + expandir todos conforme lista atual (só compositor ou catálogo completo).
    useEffect(() => {
        if (!expandAllGroupsSignal) return;
        if (!showAllProductGroups && budgetUsedGroupIdsLoading) return;
        setActiveTab("groups");
        void (async () => {
            const res = await listProductGroupsWithProductsAction();
            const list = res.success && res.data ? res.data : [];
            setGroups(list);
            setGroupsLoaded(true);
            const filtered =
                showAllProductGroups || budgetUsedGroupIds === undefined
                    ? list
                    : list.filter((g) => g.id && groupIdInAllowlist(g.id, budgetUsedGroupIds));
            const ids = filtered.map((g) => g.id).filter(Boolean) as string[];
            if (ids.length === 0) {
                setExpandedGroupIds(new Set());
                return;
            }
            setExpandedGroupIds(new Set(ids));
            await Promise.all(
                ids.map(async (id) => {
                    const resProducts = await getProductGroupProductsAction(id);
                    if (resProducts.success && resProducts.data?.length) {
                        setGroupProducts((prev) =>
                            prev[id] ? prev : { ...prev, [id]: resProducts.data as GroupProduct[] }
                        );
                    }
                })
            );
        })();
    }, [
        expandAllGroupsSignal,
        showAllProductGroups,
        budgetUsedGroupIdsLoading,
        budgetUsedGroupIds,
    ]);

    const filteredGroups =
        showAllProductGroups || budgetUsedGroupIds === undefined
            ? groups
            : groups.filter((g) => g.id && groupIdInAllowlist(g.id, budgetUsedGroupIds));

    const showSearchResults = searchQuery.trim().length > 0;

    return (
        <div
            className={cn(
                "flex-shrink-0 h-full min-h-0 w-[min(26rem,calc(100vw-1.5rem))] max-w-[100vw]",
                "rounded-xl border-2 border-primary/25 bg-card shadow-md ring-1 ring-primary/10",
                "flex flex-col overflow-hidden"
            )}
        >
            <Tabs
                value={activeTab}
                onValueChange={handleTabChange}
                className="flex h-full min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
                <div className="shrink-0 border-b border-primary/15 bg-primary/5 px-2 pt-2 pb-0">
                    <TabsList className="w-full h-11 p-1 bg-muted/80">
                        <TabsTrigger
                            value="budget"
                            className={cn(
                                "flex-1 text-sm font-medium data-[state=active]:bg-primary",
                                "data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
                                "data-[state=inactive]:text-muted-foreground"
                            )}
                        >
                            Do compositor
                        </TabsTrigger>
                        <TabsTrigger
                            value="groups"
                            className={cn(
                                "flex-1 text-sm font-medium data-[state=active]:bg-primary",
                                "data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm",
                                "data-[state=inactive]:text-muted-foreground"
                            )}
                        >
                            Grupo / busca
                        </TabsTrigger>
                    </TabsList>
                </div>

                {/* Aba: itens do documento (trecho) */}
                <TabsContent
                    value="budget"
                    className="mt-0 flex flex-1 flex-col min-h-0 overflow-hidden outline-none data-[state=inactive]:hidden"
                >
                    <div className="bg-muted/20 flex h-full min-h-0 flex-1 flex-col border-t border-primary/10">
                        <div className="px-3 py-2.5 border-b border-primary/10 text-sm font-semibold text-primary bg-primary/5">
                            Produtos disponíveis neste trecho
                        </div>
                        <ScrollArea className="flex-1 p-3">
                            <div className="space-y-3">
                                {availableItems.length === 0 && (
                                    <p className="text-sm text-muted-foreground text-center py-8 px-2 leading-relaxed">
                                        Nenhum produto neste trecho. Use a aba{" "}
                                        <span className="font-medium text-foreground">Grupo / busca</span> para arrastar
                                        do catálogo.
                                    </p>
                                )}
                                {availableItems.map((item) => {
                                    const product = (typeof item.product_id === "object" ? item.product_id : null) as Record<string, string | undefined> | null;
                                    if (!product?.id) return null;

                                    return (
                                        <ProductCard
                                            key={item.id}
                                            name={product.description || "Sem nome"}
                                            imageUrl={product.imageUrl}
                                            unit={product.unit}
                                            hint="Arraste para compor"
                                            onDragStart={(e) => onDragStartBudgetItem(e, item)}
                                        />
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>

                {/* Aba: grupos (filtrados pelo documento) + busca global */}
                <TabsContent
                    value="groups"
                    className="mt-0 flex flex-1 flex-col min-h-0 overflow-hidden outline-none data-[state=inactive]:hidden"
                >
                    <div className="bg-muted/20 flex h-full min-h-0 flex-1 flex-col border-t border-primary/10">
                        {/* Busca — área ampla, mesmo padrão visual dos botões primários */}
                        <div className="p-3 border-b border-primary/10 bg-primary/5 space-y-2">
                            <p className="text-xs font-medium text-primary px-0.5">
                                Buscar no catálogo
                            </p>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/70 pointer-events-none" />
                                <Input
                                    placeholder="Nome, código ou parte da descrição…"
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className={cn(
                                        "h-11 text-sm pl-10 pr-3",
                                        "border-primary/20 bg-background shadow-sm",
                                        "focus-visible:border-primary/40 focus-visible:ring-primary/20"
                                    )}
                                />
                            </div>
                        </div>

                        <ScrollArea className="flex-1 p-3">
                            <div className="space-y-3">
                                {/* Resultados da busca */}
                                {showSearchResults && (
                                    <>
                                        {searching && (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {!searching && searchResults.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-6 px-2">
                                                Nenhum produto encontrado. Tente outro termo.
                                            </p>
                                        )}
                                        {!searching && searchResults.map((product) => (
                                            <ProductCard
                                                key={product.id}
                                                name={product.description}
                                                imageUrl={product.imageUrl}
                                                unit={product.unit}
                                                hint="Arraste para compor"
                                                onDragStart={(e) => onDragStartCatalogProduct(e, product)}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Grupos (quando não há busca ativa) */}
                                {!showSearchResults && (
                                    <>
                                        {(!groupsLoaded ||
                                            (!showAllProductGroups && budgetUsedGroupIdsLoading)) && (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {groupsLoaded &&
                                            (showAllProductGroups || !budgetUsedGroupIdsLoading) &&
                                            groups.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-6 px-2">
                                                Nenhum grupo com produtos.
                                            </p>
                                        )}
                                        {groupsLoaded &&
                                            (showAllProductGroups || !budgetUsedGroupIdsLoading) &&
                                            budgetUsedGroupIds !== undefined &&
                                            !showAllProductGroups &&
                                            groups.length > 0 &&
                                            filteredGroups.length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-6 px-2 leading-relaxed">
                                                    Nenhum grupo usado nos itens deste compositor. Use o ícone de lista na
                                                    barra para ver todo o catálogo.
                                                </p>
                                            )}
                                        {groupsLoaded &&
                                            (showAllProductGroups || !budgetUsedGroupIdsLoading) &&
                                            filteredGroups.map((group) => {
                                            const isExpanded = expandedGroupIds.has(group.id);
                                            const products = groupProducts[group.id];
                                            const isLoading = loadingGroupIds.has(group.id);

                                            return (
                                                <div
                                                    key={group.id}
                                                    className="rounded-lg border border-border bg-background shadow-sm overflow-hidden hover:border-primary/40 transition-colors"
                                                >
                                                    <div
                                                        className={cn(
                                                            "flex w-full items-stretch gap-0 border-b border-border/80",
                                                            "bg-primary/5 hover:bg-primary/10"
                                                        )}
                                                    >
                                                        <div
                                                            draggable
                                                            role="button"
                                                            tabIndex={0}
                                                            title="Arrastar grupo para a imagem"
                                                            onDragStart={(e) =>
                                                                onDragStartCatalogGroup && onDragStartCatalogGroup(e, group)
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter" || e.key === " ") {
                                                                    e.preventDefault();
                                                                    void toggleGroup(group.id);
                                                                }
                                                            }}
                                                            className={cn(
                                                                "flex w-10 shrink-0 cursor-grab flex-col items-center justify-center gap-0.5",
                                                                "active:cursor-grabbing border-r border-primary/15 bg-primary/10",
                                                                "hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                                                            )}
                                                        >
                                                            <GripVertical className="h-4 w-4 text-primary" aria-hidden />
                                                            <Plus className="h-3 w-3 text-primary/80" aria-hidden />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(group.id)}
                                                            className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                                                        >
                                                            <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border border-border/80">
                                                                {group.image_url ? (
                                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                                    <img
                                                                        src={group.image_url}
                                                                        alt=""
                                                                        draggable={false}
                                                                        className="w-full h-full object-cover pointer-events-none select-none"
                                                                    />
                                                                ) : (
                                                                    <span className="text-xs font-bold text-primary">G</span>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <span className="text-sm font-semibold text-foreground line-clamp-2 leading-snug break-words block">
                                                                    {group.name}
                                                                </span>
                                                                <span className="mt-1 block text-xs text-muted-foreground">
                                                                    Toque na seta para ver produtos
                                                                </span>
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(group.id)}
                                                            className="shrink-0 p-2 rounded-md hover:bg-background/80 border border-transparent hover:border-border"
                                                            aria-label={isExpanded ? "Recolher" : "Expandir"}
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                        </button>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="border-t border-primary/10 p-2.5 space-y-2.5 bg-muted/15">
                                                            {isLoading && (
                                                                <div className="flex items-center justify-center py-2">
                                                                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                                                                </div>
                                                            )}
                                                            {products?.map((p) => (
                                                                <ProductCard
                                                                    key={p.id}
                                                                    name={p.description}
                                                                    imageUrl={p.imageUrl}
                                                                    unit={p.unit}
                                                                    hint="Arraste para compor"
                                                                    onDragStart={(e) => onDragStartCatalogProduct(e, p as unknown as Product)}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                        }
                                    </>
                                )}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
