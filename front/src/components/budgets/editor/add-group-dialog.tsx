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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/lib/toast";
import { Layers, Search } from "lucide-react";
import {
  listProductGroupsWithProductsAction,
  getProductGroupProductsAction,
  type ProductGroup,
} from "@/actions/product-group-actions";
import { cn } from "@/lib/utils";

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
  ) => Promise<{ success: boolean; error?: string }>;
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

  // Carrega grupos e produtos; usa índice do array como chave interna
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    setSelectedKeys(new Set());
    setQuantities(new Map());

    listProductGroupsWithProductsAction()
      .then(async (res) => {
        const list = res.success && res.data ? res.data : [];
        setGroups(list);

        const productsMap: Record<number, GroupProduct[]> = {};
        await Promise.all(
          list.map(async (g, idx) => {
            const prodsRes = await getProductGroupProductsAction(g.id);
            if (prodsRes.success && prodsRes.data && prodsRes.data.length > 0) {
              productsMap[idx] = prodsRes.data.map((p) => ({
                id: typeof p.id === "string" ? p.id : String(p.id),
                code: p.code,
                description: p.description,
                unit: p.unit,
                equipmentPrice: p.equipmentPrice,
                assemblyPrice: p.assemblyPrice,
              }));
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
          setAdding(false);
          return;
        }
        added += selectedInGroup.length;
      }
      toast.success(`${added} produto(s) adicionado(s)`);
      onOpenChange(false);
      onSuccess();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar produtos de grupos</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="relative shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar grupo por nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando grupos e produtos...</div>
          ) : filteredGroupsWithIdx.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {search.trim() ? "Nenhum grupo encontrado com esse nome." : "Nenhum grupo com produtos cadastrados."}
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0 rounded-md border">
              <div className="p-2 space-y-4">
                {filteredGroupsWithIdx.map(({ group, idx }) => {
                  const products = groupProducts[idx] ?? [];
                  if (products.length === 0) return null;

                  return (
                    <div key={idx} className="space-y-2">
                      {/* Cabeçalho do grupo */}
                      <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-muted/30 border-b">
                        <div className="flex items-center gap-2 min-w-0">
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
                          <span className="text-sm font-semibold truncate">{group.name}</span>
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
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAdd} disabled={adding || totalSelected === 0}>
            {adding ? "Adicionando..." : `Adicionar${totalSelected > 0 ? ` (${totalSelected})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
