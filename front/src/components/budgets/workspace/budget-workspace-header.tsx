"use client";

import { useState, useRef, useEffect } from "react";
import { Budget } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Eye, Pencil } from "lucide-react";
import { updateBudgetAction } from "@/actions/budget-core-write-actions";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ClientSelector } from "./client-selector";
import type { ActiveTab } from "@/components/budgets/workspace-context";

interface BudgetWorkspaceHeaderProps {
    budget: Budget;
    hasChanges?: boolean;
    onSave?: () => void;
    onOpenPreview?: () => void;
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
    tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[];
}

export function BudgetWorkspaceHeader({
    budget,
    hasChanges = false,
    onSave,
    onOpenPreview,
    activeTab,
    onTabChange,
    tabs,
}: BudgetWorkspaceHeaderProps) {
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(budget.title || "");
    const titleInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingTitle) titleInputRef.current?.select();
    }, [editingTitle]);

    const handleTitleSave = async () => {
        const trimmed = titleValue.trim();
        if (trimmed && trimmed !== budget.title) {
            await updateBudgetAction(budget.id!, { title: trimmed });
        }
        setEditingTitle(false);
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

    const getStatusBadge = (status: string) => {
        const variants: Record<string, { bg: string; text: string; label: string }> = {
            draft:    { bg: 'bg-gray-100',  text: 'text-gray-700',  label: 'Rascunho' },
            sent:     { bg: 'bg-blue-100',  text: 'text-blue-700',  label: 'Enviado'  },
            approved: { bg: 'bg-green-100', text: 'text-green-700', label: 'Aprovado' },
            rejected: { bg: 'bg-red-100',   text: 'text-red-700',   label: 'Recusado' },
        };
        const v = variants[status] || variants.draft;
        return (
            <span className={`px-2 py-0.5 rounded-full ${v.bg} ${v.text} text-xs font-medium uppercase shrink-0`}>
                {v.label}
            </span>
        );
    };

    const isDraft = budget.status === 'draft';

    return (
        <header className="border-b bg-card shrink-0 flex items-stretch h-12 overflow-hidden">
            {/* Left: back + title + status + total */}
            <div className="flex items-center gap-2 px-3 shrink-0 min-w-0 max-w-[45%]">
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" asChild>
                    <Link href="/budgets">
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                </Button>

                {editingTitle ? (
                    <Input
                        ref={titleInputRef}
                        value={titleValue}
                        onChange={(e) => setTitleValue(e.target.value)}
                        onBlur={handleTitleSave}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleTitleSave();
                            if (e.key === "Escape") { setTitleValue(budget.title || ""); setEditingTitle(false); }
                        }}
                        className="h-7 text-sm font-semibold w-48"
                    />
                ) : (
                    <button
                        type="button"
                        className="group flex items-center gap-1 hover:text-primary transition-colors min-w-0"
                        onDoubleClick={() => { setTitleValue(budget.title || ""); setEditingTitle(true); }}
                        title="Duplo clique para editar"
                    >
                        <span className="font-semibold text-sm truncate">
                            {budget.title || budget.code || "Novo Orçamento"}
                        </span>
                        <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                    </button>
                )}

                {budget.status && getStatusBadge(budget.status)}

                {hasChanges && isDraft && (
                    <span className="text-xs text-orange-600 font-medium shrink-0">• Não salvo</span>
                )}

                <ClientSelector
                    budgetId={budget.id!}
                    clientId={budget.client_id || ""}
                    isReadOnly={!isDraft}
                />

                <span className="text-sm font-semibold text-foreground shrink-0 ml-1">
                    {formatCurrency(budget.total_value || 0)}
                </span>
            </div>

            {/* Center: tabs */}
            <div className="flex flex-1 items-stretch justify-center">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={cn(
                            "flex items-center gap-1.5 px-5 text-sm font-medium border-b-2 transition-colors",
                            activeTab === tab.id
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Right: actions */}
            <div className="flex items-center gap-2 px-3 shrink-0">
                {isDraft && onSave && (
                    <Button
                        size="sm"
                        onClick={onSave}
                        variant={hasChanges ? "default" : "outline"}
                        disabled={!hasChanges}
                    >
                        <Save className="h-3.5 w-3.5 mr-1.5" />
                        Salvar
                    </Button>
                )}
                {onOpenPreview && (
                    <Button size="sm" variant="outline" onClick={onOpenPreview}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" />
                        Preview
                    </Button>
                )}
            </div>
        </header>
    );
}
