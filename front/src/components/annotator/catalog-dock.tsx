"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { GripVertical, ChevronRight, ChevronDown, Loader2, Search } from "lucide-react";
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
     * Com orçamento: lista de IDs de grupo usados nos itens do orçamento (filtra a árvore de grupos).
     * `undefined` = sem filtro (ex.: demo). Enquanto `budgetUsedGroupIdsLoading`, a lista ainda não está pronta.
     */
    budgetUsedGroupIds?: string[];
    budgetUsedGroupIdsLoading?: boolean;
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

function ProductCard({ name, imageUrl, hint, onDragStart }: {
    name: string;
    imageUrl?: string;
    hint: string;
    onDragStart: (e: React.DragEvent) => void;
}) {
    return (
        <Card
            className="p-2 cursor-grab active:cursor-grabbing hover:bg-white transition-colors border-dashed border-2 hover:border-solid hover:border-primary/50 group"
            draggable
            onDragStart={onDragStart}
        >
            <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border">
                    {imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                        <GripVertical className="w-4 h-4 text-muted-foreground" />
                    )}
                </div>
                <div className="text-xs truncate font-medium">{name}</div>
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 pl-10 opacity-70 group-hover:opacity-100">
                {hint}
            </div>
        </Card>
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
}: CatalogDockProps) {
    const defaultTab = availableItems.length > 0 ? "budget" : "groups";

    // Estado do catálogo
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [searching, setSearching] = useState(false);

    // Estado dos grupos
    const [groups, setGroups] = useState<ProductGroup[]>([]);
    const [groupsLoaded, setGroupsLoaded] = useState(false);
    const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
    const [groupProducts, setGroupProducts] = useState<Record<string, GroupProduct[]>>({});
    const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null);

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
        const res = await getProductsAction({ query, limit: 20, page: 1 });
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

    // Expandir grupo e carregar produtos sob demanda
    const toggleGroup = async (groupId: string) => {
        if (expandedGroupId === groupId) {
            setExpandedGroupId(null);
            return;
        }
        setExpandedGroupId(groupId);
        if (!groupProducts[groupId]) {
            setLoadingGroupId(groupId);
            const res = await getProductGroupProductsAction(groupId);
            if (res.success && res.data) {
                setGroupProducts(prev => ({ ...prev, [groupId]: res.data as GroupProduct[] }));
            }
            setLoadingGroupId(null);
        }
    };

    // Ao montar aba catálogo, carrega grupos
    const handleTabChange = (value: string) => {
        if (value === "groups") {
            loadGroups();
        }
    };

    // Se default é grupos, carregar lista ao montar
    useEffect(() => {
        if (defaultTab === "groups") {
            loadGroups();
        }
    }, [defaultTab, loadGroups]);

    const filteredGroups =
        budgetUsedGroupIds === undefined
            ? groups
            : groups.filter((g) => g.id && groupIdInAllowlist(g.id, budgetUsedGroupIds));

    const showSearchResults = searchQuery.trim().length > 0;

    return (
        <div className="w-56 flex-shrink-0 h-full min-h-0">
            <Tabs defaultValue={defaultTab} onValueChange={handleTabChange} className="h-full flex flex-col">
                <TabsList className="w-full shrink-0">
                    <TabsTrigger value="budget" className="flex-1 text-xs">
                        Do Orçamento
                    </TabsTrigger>
                    <TabsTrigger value="groups" className="flex-1 text-xs">
                        Grupo
                    </TabsTrigger>
                </TabsList>

                {/* Aba: Itens do Orçamento */}
                <TabsContent value="budget" className="flex-1 min-h-0 mt-0">
                    <div className="bg-muted/30 border rounded-lg h-full min-h-0 flex flex-col">
                        <div className="p-2 border-b text-xs font-semibold text-muted-foreground uppercase bg-muted/50">
                            Produtos Disponíveis
                        </div>
                        <ScrollArea className="flex-1 p-2">
                            <div className="space-y-2">
                                {availableItems.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-4 italic">
                                        Nenhum item neste trecho.
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
                                            hint="Arraste para compor"
                                            onDragStart={(e) => onDragStartBudgetItem(e, item)}
                                        />
                                    );
                                })}
                            </div>
                        </ScrollArea>
                    </div>
                </TabsContent>

                {/* Aba: Grupos do orçamento (filtrados) + busca global de produto */}
                <TabsContent value="groups" className="flex-1 min-h-0 mt-0">
                    <div className="bg-muted/30 border rounded-lg h-full min-h-0 flex flex-col">
                        {/* Busca */}
                        <div className="p-2 border-b bg-muted/50">
                            <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar produto..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                    className="h-7 text-xs pl-7 pr-2"
                                />
                            </div>
                        </div>

                        <ScrollArea className="flex-1 p-2">
                            <div className="space-y-2">
                                {/* Resultados da busca */}
                                {showSearchResults && (
                                    <>
                                        {searching && (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {!searching && searchResults.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-4 italic">
                                                Nenhum produto encontrado.
                                            </p>
                                        )}
                                        {!searching && searchResults.map((product) => (
                                            <ProductCard
                                                key={product.id}
                                                name={product.description}
                                                imageUrl={product.imageUrl}
                                                hint="Arraste para compor"
                                                onDragStart={(e) => onDragStartCatalogProduct(e, product)}
                                            />
                                        ))}
                                    </>
                                )}

                                {/* Grupos (quando não há busca ativa) */}
                                {!showSearchResults && (
                                    <>
                                        {(!groupsLoaded || budgetUsedGroupIdsLoading) && (
                                            <div className="flex items-center justify-center py-4">
                                                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                                            </div>
                                        )}
                                        {groupsLoaded &&
                                            !budgetUsedGroupIdsLoading &&
                                            groups.length === 0 && (
                                            <p className="text-xs text-muted-foreground text-center py-4 italic">
                                                Nenhum grupo com produtos.
                                            </p>
                                        )}
                                        {groupsLoaded &&
                                            !budgetUsedGroupIdsLoading &&
                                            budgetUsedGroupIds !== undefined &&
                                            groups.length > 0 &&
                                            filteredGroups.length === 0 && (
                                                <p className="text-xs text-muted-foreground text-center py-4 italic">
                                                    Nenhum grupo usado nos itens deste orçamento.
                                                </p>
                                            )}
                                        {groupsLoaded &&
                                            !budgetUsedGroupIdsLoading &&
                                            filteredGroups.map((group) => {
                                            const isExpanded = expandedGroupId === group.id;
                                            const products = groupProducts[group.id];
                                            const isLoading = loadingGroupId === group.id;

                                            return (
                                                <div key={group.id} className="border rounded-md overflow-hidden">
                                                    <div
                                                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/40 transition-colors cursor-grab active:cursor-grabbing border-b border-transparent"
                                                        draggable
                                                        onDragStart={(e) => onDragStartCatalogGroup && onDragStartCatalogGroup(e, group)}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(group.id)}
                                                            className="flex items-center gap-2 flex-1 min-w-0"
                                                        >
                                                            <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden border">
                                                                {group.image_url ? (
                                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                                    <img src={group.image_url} alt={group.name} className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-muted-foreground">G</span>
                                                                )}
                                                            </div>
                                                            <span className="text-xs font-medium truncate flex-1">{group.name}</span>
                                                            <div className="text-[10px] text-muted-foreground ml-2 opacity-70 hidden sm:block truncate shrink-0 max-w-[50px]" title="Arraste ou Clique">
                                                                (Arraste)
                                                            </div>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleGroup(group.id)}
                                                            className="shrink-0 p-1 hover:bg-muted rounded"
                                                        >
                                                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                                        </button>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="border-t p-1.5 space-y-1.5 bg-muted/10">
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
