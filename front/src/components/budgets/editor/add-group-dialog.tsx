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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { ChevronRight, Layers, Loader2, Search } from "lucide-react";
import {
  listProductGroupsWithProductsAction,
  getProductGroupProductsAction,
  type ProductGroup,
} from "@/actions/product-group-actions";
import { QuantityTextInput } from "@/components/budgets/quantity-text-input";
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
      <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] min-h-0 w-[min(52rem,calc(100vw-1.5rem))] max-w-[52rem] flex-col gap-0 overflow-hidden p-6 sm:max-w-[52rem]">
        <DialogHeader className="shrink-0 space-y-1 pb-2 text-left">
          <DialogTitle className="text-xl">Adicionar produtos de grupos</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 space-y-2 pb-4">
          <Label htmlFor="add-group-search" className="text-sm font-semibold">
            Buscar grupo
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="add-group-search"
              placeholder="Nome do grupo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1 [scrollbar-gutter:stable]">
          {loading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Carregando grupos e produtos...
            </div>
          ) : filteredGroupsWithIdx.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "Nenhum grupo encontrado com esse nome."
                : "Nenhum grupo com produtos cadastrados."}
            </div>
          ) : (
            <div
              className="min-h-[12rem] space-y-4 rounded-md border border-border bg-muted/5 p-3"
              role="region"
              aria-label="Lista de grupos e produtos"
            >
              {filteredGroupsWithIdx.map(({ group, idx }) => {
                const products = groupProducts[idx] ?? [];
                if (products.length === 0) return null;

                const isExpanded = expandedGroups.has(idx);
                const allGroupSelected = products.every((p) => selectedKeys.has(ckey(idx, p.id)));

                return (
                  <div key={idx} className="space-y-2">
                    <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-card px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(idx)}
                          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground touch-manipulation"
                          title={isExpanded ? "Recolher produtos" : "Ver produtos do grupo"}
                          aria-expanded={isExpanded}
                          aria-label={
                            isExpanded ? "Recolher lista de produtos" : "Expandir lista de produtos"
                          }
                        >
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 transition-transform duration-200",
                              isExpanded && "rotate-90"
                            )}
                          />
                        </button>
                        {group.image_url ? (
                          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={group.image_url}
                              alt={group.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                            <Layers className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="block text-base font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">
                            {group.name}
                          </span>
                          {!isExpanded && (
                            <span className="mt-0.5 block text-xs text-muted-foreground">
                              {products.length} produto{products.length !== 1 ? "s" : ""} — expanda para
                              ver
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant={allGroupSelected ? "outline" : "default"}
                        size="sm"
                        className="h-8 shrink-0 self-start text-xs sm:self-center"
                        onClick={() => toggleGroupSelection(idx)}
                      >
                        {allGroupSelected ? "Desmarcar todos" : "Selecionar disponíveis"}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="space-y-1 pl-1 sm:pl-12">
                        {products.map((p) => {
                          const isSelectedHere = selectedKeys.has(ckey(idx, p.id));
                          const isBlockedByOtherGroup =
                            !isSelectedHere && selectedBareProductIds.has(p.id);
                          return (
                            <div
                              key={p.id}
                              className={cn(
                                "flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/20",
                                isSelectedHere && "border-primary/20 bg-primary/5",
                                isBlockedByOtherGroup && "cursor-not-allowed opacity-40"
                              )}
                            >
                              <Checkbox
                                checked={isSelectedHere}
                                disabled={isBlockedByOtherGroup}
                                onCheckedChange={() => {
                                  if (!isBlockedByOtherGroup) toggleProduct(idx, p.id);
                                }}
                              />
                              <div
                                className={cn(
                                  "min-w-0 flex-1 py-0.5",
                                  !isBlockedByOtherGroup && "cursor-pointer"
                                )}
                                onClick={() => {
                                  if (!isBlockedByOtherGroup) toggleProduct(idx, p.id);
                                }}
                              >
                                <div className="text-sm font-medium leading-snug [overflow-wrap:anywhere]">
                                  {p.description}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {p.code} · {p.unit} ·{" "}
                                  {formatCurrency(p.equipmentPrice + p.assemblyPrice)}
                                </div>
                              </div>
                              <QuantityTextInput
                                value={quantities.get(ckey(idx, p.id)) ?? 1}
                                min={1}
                                disabled={!isSelectedHere}
                                onValueChange={(n) => setQuantity(idx, p.id, n)}
                                onClick={(e) => e.stopPropagation()}
                                className="w-14 shrink-0 rounded border border-input bg-background px-1 py-0.5 text-center text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-40"
                                aria-label={`Quantidade ${p.description}`}
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
          )}
        </div>

        <DialogFooter className="mt-4 shrink-0 gap-2 border-t pt-4 sm:justify-end sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={adding}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void handleAdd()} disabled={adding || totalSelected === 0}>
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Adicionar${totalSelected > 0 ? ` (${totalSelected})` : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
