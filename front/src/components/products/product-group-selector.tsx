"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
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
import { Checkbox } from "@/components/ui/checkbox";
import { listProductGroupsAction, createProductGroupAction, type ProductGroup } from "@/actions/product-group-actions";
import { toast } from "@/lib/toast";
import { Plus, Loader2, ChevronsUpDown, Search, Layers } from "lucide-react";

interface ProductGroupSelectorProps {
  value: string[];
  onChange: (groupIds: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export function ProductGroupSelector({ value, onChange, disabled, className }: ProductGroupSelectorProps) {
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    const res = await listProductGroupsAction();
    if (res.success && res.data) setGroups(res.data);
    setLoading(false);
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadGroups();
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleToggle = (groupId: string, checked: boolean) => {
    if (checked) {
      onChange([...value, groupId]);
    } else {
      onChange(value.filter((id) => id !== groupId));
    }
  };

  const handleCreate = async () => {
    const name = newGroupName.trim();
    if (!name) {
      toast.error("Informe o nome do grupo");
      return;
    }
    setCreating(true);
    const fd = new FormData();
    fd.append("name", name);
    const res = await createProductGroupAction(fd);
    setCreating(false);
    if (res.success && res.data) {
      setGroups((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      onChange([...value, res.data.id]);
      setNewGroupName("");
      setCreateOpen(false);
      toast.success("Grupo criado");
    } else {
      toast.error(res.error ?? "Erro ao criar grupo");
    }
  };

  const selectedNames = groups
    .filter((g) => value.includes(g.id))
    .map((g) => g.name);

  const filtered = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  const triggerLabel = loading
    ? "Carregando..."
    : selectedNames.length === 0
      ? "Nenhum grupo selecionado"
      : selectedNames.length <= 2
        ? selectedNames.join(", ")
        : `${selectedNames.length} grupos selecionados`;

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
                placeholder="Buscar grupo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                {groups.length === 0 ? "Nenhum grupo cadastrado." : "Nenhum resultado."}
              </p>
            ) : (
              filtered.map((group) => (
                <label
                  key={group.id}
                  className="flex items-center gap-2 cursor-pointer rounded-sm px-2 py-1.5 hover:bg-accent transition-colors"
                >
                  <Checkbox
                    checked={value.includes(group.id)}
                    onCheckedChange={(checked) => handleToggle(group.id, checked === true)}
                    disabled={disabled}
                  />
                  {group.image_url ? (
                    <div className="relative w-8 h-8 rounded overflow-hidden bg-muted shrink-0">
                      <Image
                        src={group.image_url}
                        alt={group.name}
                        fill
                        sizes="32px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                      <Layers className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <span className="text-sm">{group.name}</span>
                </label>
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
              Criar novo grupo...
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo grupo de produtos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="newGroupName">Nome do grupo</Label>
            <Input
              id="newGroupName"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Ex: Kit Guarda-Corpo"
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newGroupName.trim()}>
              {creating ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
