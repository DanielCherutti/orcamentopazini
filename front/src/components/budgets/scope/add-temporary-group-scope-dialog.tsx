"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3, Loader2 } from "lucide-react";
import { createTemporaryGroupInSectionAction } from "@/actions/budget-hierarchy-section-items-actions";
import type { BudgetItem } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TruncatedTextTooltip } from "@/components/ui/tooltip";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";

function itemLabel(item: BudgetItem): string {
    const row = item as unknown as Record<string, unknown>;
    const product =
        item.product_id && typeof item.product_id === "object"
            ? (item.product_id as Record<string, unknown>)
            : undefined;
    return String(
        row.product_name ?? product?.description ?? product?.name ?? row.product_code ?? "Produto",
    ).trim() || "Produto";
}

export function AddTemporaryGroupScopeDialog({
    open,
    onOpenChange,
    sectionId,
    budgetId,
    items,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sectionId: string;
    budgetId: string;
    items: BudgetItem[];
    onSuccess: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    const [name, setName] = useState("");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
    const [loading, setLoading] = useState(false);
    const availableItems = useMemo(
        () => items.filter((item): item is BudgetItem & { id: string } => Boolean(item.id)),
        [items],
    );

    useEffect(() => {
        queueMicrotask(() => setMounted(true));
    }, []);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setName("");
            setSelectedIds(new Set());
        }
        onOpenChange(nextOpen);
    };

    const toggle = (id: string, checked: boolean) => {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleCreate = async () => {
        if (name.trim().length < 2) {
            toast.error("Informe o nome do grupo temporário.");
            return;
        }
        if (selectedIds.size === 0) {
            toast.error("Selecione ao menos um produto.");
            return;
        }
        setLoading(true);
        const result = await createTemporaryGroupInSectionAction(
            sectionId,
            budgetId,
            name,
            [...selectedIds],
        );
        setLoading(false);
        if (!result.success) {
            toast.error(result.error || "Erro ao criar grupo temporário");
            return;
        }
        toast.success("Grupo temporário criado");
        handleOpenChange(false);
        onSuccess();
    };

    return (
        <>
            {mounted && open
                ? createPortal(
                      <div
                          role="presentation"
                          aria-hidden
                          className="fixed inset-0 z-40 animate-in fade-in-0 bg-black/50 duration-200"
                          onClick={() => handleOpenChange(false)}
                      />,
                      document.body,
                  )
                : null}
            <Dialog open={open} onOpenChange={handleOpenChange} modal={false}>
                <DialogContent className="flex max-h-[min(90dvh,calc(100dvh-2rem))] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-0 shadow-xl">
                    <DialogHeader className="shrink-0 border-b bg-muted/40 px-6 py-4 text-left">
                        <DialogTitle className="flex items-center gap-2 text-xl">
                            <Layers3 className="h-5 w-5" /> Criar grupo temporário
                        </DialogTitle>
                        <DialogDescription>
                            O grupo existirá somente neste orçamento e não será incluído no cadastro de grupos.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]">
                        <div className="space-y-2">
                            <Label htmlFor="temporary-group-name">Nome do grupo</Label>
                            <Input
                                id="temporary-group-name"
                                value={name}
                                maxLength={120}
                                disabled={loading}
                                autoFocus
                                placeholder="Ex.: Kit elevador externo"
                                onChange={(event) => setName(event.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                                <Label>Produtos do grupo</Label>
                                {availableItems.length > 0 ? (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs"
                                        disabled={loading}
                                        onClick={() =>
                                            setSelectedIds(
                                                selectedIds.size === availableItems.length
                                                    ? new Set()
                                                    : new Set(availableItems.map((item) => item.id)),
                                            )
                                        }
                                    >
                                        {selectedIds.size === availableItems.length
                                            ? "Desmarcar todos"
                                            : "Selecionar todos"}
                                    </Button>
                                ) : null}
                            </div>
                            <div className="max-h-80 overflow-y-auto rounded-md border">
                                {availableItems.length === 0 ? (
                                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                                        Adicione produtos ao trecho antes de criar um grupo.
                                    </p>
                                ) : (
                                    availableItems.map((item) => (
                                        <label
                                            key={item.id}
                                            className="flex cursor-pointer items-center gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-muted/40"
                                        >
                                            <Checkbox
                                                checked={selectedIds.has(item.id)}
                                                disabled={loading}
                                                onCheckedChange={(checked) => toggle(item.id, checked === true)}
                                            />
                                            <TruncatedTextTooltip
                                                text={itemLabel(item)}
                                                className="flex-1 text-sm"
                                            />
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                                Qtd. {Number(item.quantity) || 1}
                                            </span>
                                        </label>
                                    ))
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Produtos que já estejam em outro grupo serão movidos para o novo grupo temporário.
                            </p>
                        </div>
                    </div>
                    <DialogFooter className="shrink-0 gap-2 border-t bg-muted/20 px-6 py-4 sm:gap-0">
                        <Button type="button" variant="outline" disabled={loading} onClick={() => handleOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            disabled={loading || availableItems.length === 0}
                            onClick={() => void handleCreate()}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar grupo"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
