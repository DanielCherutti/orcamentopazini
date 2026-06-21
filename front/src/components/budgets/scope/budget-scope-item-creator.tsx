"use client";

import { useState } from "react";
import { PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddGroupDialog } from "@/components/budgets/editor/add-group-dialog";
import { AddProductScopeDialog } from "@/components/budgets/scope/add-product-scope-dialog";
import { AddTemporaryProductScopeDialog } from "@/components/budgets/scope/add-temporary-product-scope-dialog";
import { addGroupToSectionAction } from "@/actions/budget-hierarchy-section-items-actions";
import { cn } from "@/lib/utils";

/** Tamanho/layout comum dos botões de adicionar no escopo (cor primária via `variant="default"`). */
const SCOPE_ADD_CONTROL_CLASS = "h-8 w-full gap-1.5 text-xs sm:w-auto";

export function ScopeItemCreator({
    sectionId,
    budgetId,
    onSuccess,
}: {
    sectionId: string;
    budgetId: string;
    onSuccess: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [tempOpen, setTempOpen] = useState(false);
    return (
        <>
            <Button
                variant="default"
                size="sm"
                type="button"
                className={cn("shrink-0", SCOPE_ADD_CONTROL_CLASS)}
                onClick={() => setOpen(true)}
            >
                <Plus className="h-3.5 w-3.5 shrink-0" /> Adicionar produto
            </Button>
            <Button
                variant="outline"
                size="sm"
                type="button"
                className={cn("shrink-0", SCOPE_ADD_CONTROL_CLASS)}
                onClick={() => setTempOpen(true)}
            >
                <PackagePlus className="h-3.5 w-3.5 shrink-0" /> Produto temporário
            </Button>
            <AddProductScopeDialog
                open={open}
                onOpenChange={setOpen}
                sectionId={sectionId}
                budgetId={budgetId}
                onSuccess={onSuccess}
            />
            <AddTemporaryProductScopeDialog
                open={tempOpen}
                onOpenChange={setTempOpen}
                sectionId={sectionId}
                budgetId={budgetId}
                onSuccess={onSuccess}
            />
        </>
    );
}

export function ScopeGroupAdder({
    sectionId,
    budgetId,
    onSuccess,
}: {
    sectionId: string;
    budgetId: string;
    onSuccess: () => void;
}) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button
                variant="default"
                size="sm"
                type="button"
                className={cn("shrink-0", SCOPE_ADD_CONTROL_CLASS)}
                onClick={() => setOpen(true)}
            >
                <Plus className="h-3.5 w-3.5 shrink-0" /> Adicionar Grupo de Produtos
            </Button>
            <AddGroupDialog
                open={open}
                onOpenChange={setOpen}
                sectionId={sectionId}
                budgetId={budgetId}
                onSuccess={onSuccess}
                addGroupToSection={addGroupToSectionAction}
            />
        </>
    );
}
