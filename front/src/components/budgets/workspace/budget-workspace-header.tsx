"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Budget } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save, Eye, Pencil, Lock, GitBranchPlus, CircleCheck } from "lucide-react";
import { updateBudgetAction } from "@/actions/budget-core-write-actions";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientSelector } from "./client-selector";
import type { ActiveTab } from "@/components/budgets/workspace-context";
import {
    canApproveBudget,
    canUseBudgetEmail,
    isBudgetEditableStatus,
} from "@/lib/budgets/budget-status";
import { canShowCreateRevisionButton, formatBudgetRevisionBadge } from "@/lib/budgets/budget-revision";
import { budgetEditUrl } from "@/lib/budgets/budget-path";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { toast } from "@/lib/toast";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import { BudgetModelImportDialog } from "@/components/budgets/budget-model-import-dialog";
import { BudgetDeliveryLaunchButton } from "@/components/budgets/workspace/budget-delivery-launch-button";

interface BudgetWorkspaceHeaderProps {
    budget: Budget;
    hasChanges?: boolean;
    onSave?: () => void;
    onOpenPreview?: () => void;
    /** Recarrega o compositor após mudança de status (ex.: finalizar). */
    onBudgetRefresh?: () => void | Promise<void>;
    activeTab: ActiveTab;
    onTabChange: (tab: ActiveTab) => void;
    tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[];
}

export function BudgetWorkspaceHeader({
    budget,
    hasChanges = false,
    onSave,
    onOpenPreview,
    onBudgetRefresh,
    activeTab,
    onTabChange,
    tabs,
}: BudgetWorkspaceHeaderProps) {
    const router = useRouter();
    const repo = useBudgetsRepository();
    const confirmDialog = useConfirmDialog();
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState(budget.title || "");
    const [creatingRevision, setCreatingRevision] = useState(false);
    const [approving, setApproving] = useState(false);
    const titleInputRef = useRef<HTMLInputElement>(null);
    const revisionBadge = formatBudgetRevisionBadge(budget.revision_number);

    useEffect(() => {
        if (editingTitle) titleInputRef.current?.select();
    }, [editingTitle]);

    const handleTitleSave = async () => {
        if (!isBudgetEditableStatus(budget.status)) {
            setEditingTitle(false);
            return;
        }
        const trimmed = titleValue.trim();
        if (trimmed && trimmed !== budget.title) {
            await updateBudgetAction(budget.id!, { title: trimmed });
        }
        setEditingTitle(false);
    };

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);

    /** Total persistido (soma do escopo). Vara % / Desconto % da aba Orçamento não entram neste valor. */
    const displayTotalValue = useMemo(
        () => Number(budget.total_value ?? 0),
        [budget.total_value]
    );

    const getStatusBadge = (status: string) => {
        const variants: Record<string, { bg: string; text: string; label: string }> = {
            draft:      { bg: 'bg-emerald-50',  text: 'text-emerald-800',  label: 'Em andamento' },
            finalized:  { bg: 'bg-slate-200',   text: 'text-slate-800',    label: 'Finalizado' },
            sent:       { bg: 'bg-blue-100',    text: 'text-blue-700',     label: 'Enviado' },
            approved:   { bg: 'bg-green-100',   text: 'text-green-700',    label: 'Aprovado' },
            rejected:   { bg: 'bg-red-100',     text: 'text-red-700',      label: 'Recusado' },
        };
        const v = variants[status] || variants.draft;
        return (
            <span className={`px-2 py-0.5 rounded-full ${v.bg} ${v.text} text-xs font-medium uppercase shrink-0`}>
                {v.label}
            </span>
        );
    };

    const editable = isBudgetEditableStatus(budget.status);
    const emailEnabled = canUseBudgetEmail(budget.status);
    const canRevision = canShowCreateRevisionButton(budget, [budget]);
    const canApprove = canApproveBudget(budget.status);

    const handleCreateRevision = async () => {
        if (!budget.id || creatingRevision) return;
        const ok = await confirmDialog({
            title: "Criar revisão",
            description:
                "Criar uma revisão em andamento a partir deste orçamento? O original permanece finalizado e não poderá ser editado.",
            confirmLabel: "Criar revisão",
        });
        if (!ok) return;
        setCreatingRevision(true);
        const res = await repo.createBudgetRevision(budget.id);
        setCreatingRevision(false);
        if (res.success && res.newBudgetId) {
            toast.success("Revisão criada. Você pode editar a nova versão.");
            router.push(budgetEditUrl(res.newBudgetId));
            return;
        }
        toast.error(res.error || "Não foi possível criar a revisão.");
    };

    const handleApprove = async () => {
        if (!budget.id || approving) return;
        const ok = await confirmDialog({
            title: "Aprovar orçamento",
            description:
                "Confirmar que o cliente aprovou esta proposta? Depois disso você poderá abrir o projeto de entrega técnica.",
            confirmLabel: "Aprovar",
        });
        if (!ok) return;
        setApproving(true);
        try {
            const res = await updateBudgetAction(budget.id, { status: "approved" });
            if (res.success) {
                toast.success("Orçamento marcado como aprovado.");
                await onBudgetRefresh?.();
            } else {
                toast.error(res.error || "Não foi possível aprovar o orçamento.");
            }
        } finally {
            setApproving(false);
        }
    };

    return (
        <header className="tenant-ops-command-bar flex h-12 shrink-0 items-stretch min-w-0">
            {/* Left: back + title + status + total */}
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3">
                <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2" asChild>
                    <Link href="/budgets" title="Voltar para orçamentos">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden lg:inline text-xs">Orçamentos</span>
                    </Link>
                </Button>

                <span className="hidden md:inline text-muted-foreground/40" aria-hidden>/</span>
                <span className="hidden md:inline truncate text-xs text-muted-foreground max-w-[8rem] lg:max-w-[12rem]">
                    {budget.code || "Compositor"}
                </span>
                <span className="hidden md:inline text-muted-foreground/40" aria-hidden>/</span>

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
                        className={cn(
                            "group flex items-center gap-1 min-w-0",
                            editable && "hover:text-primary transition-colors cursor-pointer",
                            !editable && "cursor-default"
                        )}
                        onDoubleClick={() => {
                            if (!editable) return;
                            setTitleValue(budget.title || "");
                            setEditingTitle(true);
                        }}
                        title={editable ? "Duplo clique para editar" : "Somente leitura"}
                    >
                        <span className="font-semibold text-sm truncate">
                            {budget.title || budget.code || "Novo Compositor"}
                        </span>
                        {editable && (
                            <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" />
                        )}
                    </button>
                )}

                {budget.status && getStatusBadge(budget.status)}

                {revisionBadge ? (
                    <span className="budget-revision-badge shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold">
                        {revisionBadge}
                    </span>
                ) : null}

                {hasChanges && editable && (
                    <span className="text-xs text-orange-600 font-medium shrink-0">• Não salvo</span>
                )}

                <ClientSelector
                    budgetId={budget.id!}
                    clientId={budget.client_id || ""}
                    isReadOnly={!editable}
                />

                <span className="ml-1 hidden shrink-0 text-sm font-semibold tabular-nums text-foreground lg:inline">
                    {formatCurrency(displayTotalValue)}
                </span>
            </div>

            {/* Center: tabs */}
            <div className="flex shrink-0 items-stretch border-x border-white/10">
                {tabs.map((tab) => {
                    const tabDisabled = tab.id === "email" && !emailEnabled;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            disabled={tabDisabled}
                            title={
                                tabDisabled
                                    ? "Finalize o orçamento para enviar e-mail ao cliente"
                                    : tab.label
                            }
                            onClick={() => {
                                if (!tabDisabled) onTabChange(tab.id);
                            }}
                            className={cn(
                                "flex items-center gap-1.5 px-3 text-sm font-medium border-b-2 transition-colors xl:px-4",
                                tabDisabled &&
                                    "opacity-45 cursor-not-allowed hover:text-muted-foreground hover:border-transparent",
                                !tabDisabled &&
                                    (activeTab === tab.id
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
                            )}
                        >
                            {tab.icon}
                            <span className="hidden xl:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Right: actions — nunca cortar; rolagem horizontal só se a tela for muito estreita */}
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {editable && onSave && (
                    <Button
                        size="sm"
                        onClick={onSave}
                        variant={hasChanges ? "default" : "outline"}
                        disabled={!hasChanges}
                        title="Salvar"
                    >
                        <Save className="h-3.5 w-3.5 xl:mr-1.5" />
                        <span className="hidden xl:inline">Salvar</span>
                    </Button>
                )}
                {editable && (
                    <BudgetModelImportDialog
                        budgetId={budget.id!}
                        onImported={onBudgetRefresh}
                    />
                )}
                {canRevision && (
                    <Button
                        size="sm"
                        variant="default"
                        disabled={creatingRevision}
                        onClick={handleCreateRevision}
                        title="Criar revisão"
                    >
                        <GitBranchPlus className="h-3.5 w-3.5 xl:mr-1.5" />
                        <span className="hidden xl:inline">
                            {creatingRevision ? "Criando…" : "Criar revisão"}
                        </span>
                    </Button>
                )}
                {canApprove && onBudgetRefresh && (
                    <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white"
                        disabled={approving}
                        onClick={handleApprove}
                        title="Aprovar orçamento"
                    >
                        <CircleCheck className="h-3.5 w-3.5 xl:mr-1.5" />
                        <span className="hidden xl:inline">
                            {approving ? "Aprovando…" : "Aprovar"}
                        </span>
                    </Button>
                )}
                {budget.status === "approved" && budget.id ? (
                    <BudgetDeliveryLaunchButton budgetId={budget.id} />
                ) : null}
                {editable && onBudgetRefresh && (
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/40"
                        title="Finalizar compositor"
                        onClick={async () => {
                            const ok = await confirmDialog({
                                title: "Finalizar compositor",
                                description:
                                    "Finalizar este compositor? Depois disso ele não poderá mais ser editado — apenas visualizado, pré-visualização e PDF.",
                                confirmLabel: "Finalizar",
                            });
                            if (!ok) return;
                            const res = await updateBudgetAction(budget.id!, { status: "finalized" });
                            if (res.success) {
                                toast.success("Compositor finalizado.");
                                await onBudgetRefresh();
                            } else {
                                toast.error(res.error || "Não foi possível finalizar.");
                            }
                        }}
                    >
                        <Lock className="h-3.5 w-3.5 xl:mr-1.5" />
                        <span className="hidden xl:inline">Finalizar</span>
                    </Button>
                )}
                {onOpenPreview && (
                    <Button size="sm" variant="outline" onClick={onOpenPreview} title="Preview PDF">
                        <Eye className="h-3.5 w-3.5 xl:mr-1.5" />
                        <span className="hidden xl:inline">Preview</span>
                    </Button>
                )}
            </div>
        </header>
    );
}
