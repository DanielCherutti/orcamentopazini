"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { ChevronRight, Layers, Search } from "lucide-react";
import {
  listProductGroupsWithProductsAction,
  getProductGroupProductsAction,
  type ProductGroup,
} from "@/actions/product-group-actions";
import { cn } from "@/lib/utils";
import { canonicalTableRecordId } from "@/lib/surreal-record-ids";

// Chave composta: groupIdx (posição no array) + productId — garante unicidade
// independentemente de como o SDK SurrealDB serializa os IDs de grupo.
const ckey = (groupIdx: number, productId: string) => `${groupIdx}::${productId}`;

type GroupProduct = {
  id: string;
  code: string;
  description: string;
  unit: string;
  equipmentPrice: number;
  assemblyPrice: number;
};

interface AddGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionId: string;
  budgetId: string;
  onSuccess: () => void;
  addGroupToSection: (
    sectionId: string,
    budgetId: string,
    groupId: string,
    groupName: string,
    productQuantities: Record<string, number>,
    selectedProductIds: string[]
  ) => Promise<{ success: boolean; error?: string; addedCount?: number }>;
}

export function AddGroupDialog({
  open,
  onOpenChange,
  sectionId,
  budgetId,
  onSuccess,
  addGroupToSection,
}: AddGroupDialogProps) {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  // Keyed by original array index (string) — evita depender de group.id serializado
  const [groupProducts, setGroupProducts] = useState<Record<number, GroupProduct[]>>({});
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  /** Índices de grupos com lista de produtos expandida (por padrão todos recolhidos). */
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const toggleGroupExpanded = useCallback((groupIdx: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupIdx)) next.delete(groupIdx);
      else next.add(groupIdx);
      return next;
    });
  }, []);

  // Carrega grupos e produtos; usa índice do array como chave interna
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    setSelectedKeys(new Set());
    setQuantities(new Map());
    setExpandedGroups(new Set());

    listProductGroupsWithProductsAction()
      .then(async (res) => {
        const list = res.success && res.data ? res.data : [];
        setGroups(list);

        const productsMap: Record<number, GroupProduct[]> = {};
        await Promise.all(
          list.map(async (g, idx) => {
            const prodsRes = await getProductGroupProductsAction(g.id);
            if (prodsRes.success && prodsRes.data && prodsRes.data.length > 0) {
              productsMap[idx] = prodsRes.data
                .map((p) => ({
                  id: canonicalTableRecordId("product", p.id),
                  code: p.code,
                  description: p.description,
                  unit: p.unit,
                  equipmentPrice: p.equipmentPrice,
                  assemblyPrice: p.assemblyPrice,
                }))
                .filter((p) => p.id.length > 0);
            }
          })
        );
        setGroupProducts(productsMap);
      })
      .finally(() => setLoading(false));
  }, [open]);

  // groups filtrados para busca — mantém referência ao índice original
  const filteredGroupsWithIdx = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .map((g, idx) => ({ group: g, idx }))
      .filter(({ group }) => !q || group.name.toLowerCase().includes(q));
  }, [groups, search]);

  // IDs "puros" de produto selecionados em QUALQUER grupo
  const selectedBareProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const k of selectedKeys) {
      const productId = k.split("::").slice(1).join("::");
      ids.add(productId);
    }
    return ids;
  }, [selectedKeys]);

  const toggleProduct = useCallback((groupIdx: number, productId: string) => {
    const k = ckey(groupIdx, productId);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  const setQuantity = useCallback((groupIdx: number, productId: string, qty: number) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      next.set(ckey(groupIdx, productId), Math.max(1, qty));
      return next;
    });
  }, []);

  const toggleGroupSelection = useCallback((groupIdx: number) => {
    const prods = groupProducts[groupIdx] ?? [];
    // Produtos disponíveis = não bloqueados por outro grupo
    const availableProds = prods.filter((p) => {
      const blockedByOther = [...selectedKeys].some(
        (k) => k !== ckey(groupIdx, p.id) && k.split("::").slice(1).join("::") === p.id
      );
      return !blockedByOther;
    });
    const allSelected =
      availableProds.length > 0 &&
      availableProds.every((p) => selectedKeys.has(ckey(groupIdx, p.id)));

    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const p of availableProds) {
        const k = ckey(groupIdx, p.id);
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
    if (!allSelected) {
      setQuantities((prev) => {
        const next = new Map(prev);
        for (const p of availableProds) {
          const k = ckey(groupIdx, p.id);
          next.set(k, next.get(k) ?? 1);
        }
        return next;
      });
    }
  }, [groupProducts, selectedKeys]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  const totalSelected = selectedKeys.size;

  const handleAdd = async () => {
    if (totalSelected === 0) {
      toast.error("Selecione ao menos um produto");
      return;
    }
    setAdding(true);
    try {
      let added = 0;
      for (let idx = 0; idx < groups.length; idx++) {
        const g = groups[idx];
        const prods = groupProducts[idx] ?? [];
        const selectedInGroup = prods.filter((p) => selectedKeys.has(ckey(idx, p.id)));
        if (selectedInGroup.length === 0) continue;

        const productQuantities: Record<string, number> = {};
        for (const p of selectedInGroup) {
          productQuantities[p.id] = quantities.get(ckey(idx, p.id)) ?? 1;
        }
        const result = await addGroupToSection(
          sectionId,
          budgetId,
          g.id,
          g.name,
          productQuantities,
          selectedInGroup.map((p) => p.id)
        );
        if (!result.success) {
          toast.error(result.error ?? "Erro ao adicionar grupo");
          return;
        }
        added += result.addedCount ?? 0;
      }
      if (added === 0) {
        toast.error("Nenhum produto foi adicionado. Verifique a seleção e tente novamente.");
        return;
      }
      toast.success(`${added} produto(s) adicionado(s)`);
      onOpenChange(false);
      onSuccess();
    } catch (e) {
      console.error("handleAdd group products:", e);
      toast.error("Erro ao adicionar produtos. Tente novamente.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,900px)] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <div className="flex flex-col gap-3 border-b px-6 pb-3 pt-6 shrink-0">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle>Adicionar produtos de grupos</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar grupo por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 px-6 py-3">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando grupos e produtos...</div>
          ) : filteredGroupsWithIdx.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {search.trim() ? "Nenhum grupo encontrado com esse nome." : "Nenhum grupo com produtos cadastrados."}
            </div>
          ) : (
            <div
              className="max-h-[calc(90vh-14rem)] min-h-[8rem] overflow-y-auto overflow-x-hidden rounded-md border border-border overscroll-contain pr-1 [scrollbar-gutter:stable]"
              role="region"
              aria-label="Lista de grupos e produtos"
            >
              <div className="p-2 space-y-4">
                {filteredGroupsWithIdx.map(({ group, idx }) => {
                  const products = groupProducts[idx] ?? [];
                  if (products.length === 0) return null;

                  const isExpanded = expandedGroups.has(idx);

                  return (
                    <div key={idx} className="space-y-2">
                      {/* Cabeçalho do grupo */}
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30 border-b">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleGroupExpanded(idx)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-manipulation"
                            title={isExpanded ? "Recolher produtos" : "Ver produtos do grupo"}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Recolher lista de produtos" : "Expandir lista de produtos"}
                          >
                            <ChevronRight
                              className={cn(
                                "h-4 w-4 transition-transform duration-200",
                                isExpanded && "rotate-90"
                              )}
                            />
                          </button>
                          {group.image_url ? (
                            <div className="relative w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={group.image_url}
                                alt={group.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                              <Layers className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-semibold truncate block">{group.name}</span>
                            {!isExpanded && (
                              <span className="text-[11px] text-muted-foreground">
                                {products.length} produto{products.length !== 1 ? "s" : ""} — clique na seta para ver
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 shrink-0"
                          onClick={() => toggleGroupSelection(idx)}
                        >
                          {products.every((p) => selectedKeys.has(ckey(idx, p.id)))
                            ? "Desmarcar todos"
                            : "Selecionar disponíveis"}
                        </Button>
                      </div>

                      {/* Lista de produtos do grupo */}
                      {isExpanded && (
                      <div className="space-y-1 pl-1">
                        {products.map((p) => {
                          const isSelectedHere = selectedKeys.has(ckey(idx, p.id));
                          const isBlockedByOtherGroup =
                            !isSelectedHere && selectedBareProductIds.has(p.id);
                          return (
                            <div
                              key={p.id}
                              className={cn(
                                "flex items-center gap-3 px-2 py-1.5 rounded-md border border-transparent hover:bg-muted/20",
                                isSelectedHere && "bg-primary/5 border-primary/20",
                                isBlockedByOtherGroup && "opacity-40 cursor-not-allowed"
                              )}
                            >
                              <Checkbox
                                checked={isSelectedHere}
                                disabled={isBlockedByOtherGroup}
                                onCheckedChange={() => { if (!isBlockedByOtherGroup) toggleProduct(idx, p.id); }}
                              />
                              <div
                                className={cn("flex-1 min-w-0 py-0.5", !isBlockedByOtherGroup && "cursor-pointer")}
                                onClick={() => { if (!isBlockedByOtherGroup) toggleProduct(idx, p.id); }}
                              >
                                <div className="text-sm font-medium truncate">{p.description}</div>
                                <div className="text-xs text-muted-foreground">
                                  {p.code} · {p.unit} · {formatCurrency(p.equipmentPrice + p.assemblyPrice)}
                                </div>
                              </div>
                              <input
                                type="number"
                                min={1}
                                value={quantities.get(ckey(idx, p.id)) ?? 1}
                                disabled={!isSelectedHere}
                                onChange={(e) => setQuantity(idx, p.id, Number(e.target.value))}
                                onClick={(e) => e.stopPropagation()}
                                className="w-14 text-center border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                              />
                            </div>
                          );
                        })}
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-6 py-4 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleAdd()} disabled={adding || totalSelected === 0}>
            {adding ? "Adicionando..." : `Adicionar${totalSelected > 0 ? ` (${totalSelected})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
