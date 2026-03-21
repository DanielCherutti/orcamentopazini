"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listProductUnitsAction, createProductUnitAction, type ProductUnit } from "@/actions/product-unit-actions";
import { toast } from "@/lib/toast";
import { Plus, Loader2, ChevronsUpDown, Search, Check } from "lucide-react";

interface ProductUnitSelectorProps {
  value: string;
  onChange: (unitName: string) => void;
  disabled?: boolean;
  className?: string;
}

export function ProductUnitSelector({ value, onChange, disabled, className }: ProductUnitSelectorProps) {
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadUnits = async () => {
    setLoading(true);
    const res = await listProductUnitsAction();
    if (res.success && res.data) setUnits(res.data);
    setLoading(false);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadUnits();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSelect = (unitName: string) => {
    onChange(unitName);
    setOpen(false);
  };

  const handleCreate = async () => {
    const name = newUnitName.trim();
    if (!name) {
      toast.error("Informe o nome da unidade");
      return;
    }
    setCreating(true);
    const res = await createProductUnitAction({ name });
    setCreating(false);
    if (res.success && res.data) {
      const newUnit = res.data;
      setUnits((prev) => {
        const exists = prev.some((u) => u.id === newUnit.id);
        if (exists) return prev;
        return [...prev, newUnit].sort((a, b) => a.name.localeCompare(b.name));
      });
      onChange(newUnit.name);
      setNewUnitName("");
      setCreateOpen(false);
      toast.success("Unidade criada");
    } else {
      toast.error(res.error ?? "Erro ao criar unidade");
    }
  };

  const filtered = search
    ? units.filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    : units;

  const triggerLabel = loading
    ? "Carregando..."
    : value || "Selecione uma unidade";

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || loading}
            className={`w-full justify-between font-normal ${className || ""}`}
            type="button"
          >
            <span className="truncate">{triggerLabel}</span>
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 px-1">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Buscar unidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {units.length === 0 ? "Nenhuma unidade cadastrada." : "Nenhum resultado."}
              </p>
            ) : (
              filtered.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className="flex items-center gap-2 w-full cursor-pointer rounded-sm px-2 py-1.5 hover:bg-accent transition-colors text-left"
                  onClick={() => handleSelect(unit.name)}
                >
                  <Check className={`h-4 w-4 shrink-0 ${value === unit.name ? "opacity-100" : "opacity-0"}`} />
                  <span className="text-sm">{unit.name}</span>
                </button>
              ))
            )}
          </div>
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 px-2 text-muted-foreground"
              onClick={() => {
                setCreateOpen(true);
                setOpen(false);
              }}
              disabled={disabled}
            >
              <Plus className="h-4 w-4 mr-1" />
              Criar nova unidade...
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova unidade de medida</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="newUnitName">Nome da unidade</Label>
            <Input
              id="newUnitName"
              value={newUnitName}
              onChange={(e) => setNewUnitName(e.target.value)}
              placeholder="Ex: UN, KG, M²"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newUnitName.trim()}>
              {creating ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
