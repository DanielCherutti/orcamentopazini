"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, Edit2, Eye, GitBranchPlus, Trash2 } from "lucide-react";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { budgetEditUrl } from "@/lib/budgets/budget-path";
import { toast } from "@/lib/toast";
import type { Budget } from "@/types/budget-types";
import { canCreateBudgetRevision, getBudgetStatusLabel, isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import {
    canShowCreateRevisionButton,
    formatBudgetRevisionBadge,
} from "@/lib/budgets/budget-revision";
import { annotateBudgetListRows, type BudgetListDisplayRow } from "@/lib/budgets/budget-list-tree";
import { cn } from "@/lib/utils";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";

function BudgetListBranch({ isLast }: { isLast: boolean }) {
    return (
        <div
            className="relative mr-2 flex h-10 w-5 shrink-0 items-center"
            aria-hidden
        >
            <span
                className={cn(
                    "absolute left-2 top-0 w-px bg-violet-300",
                    isLast ? "h-5" : "h-full"
                )}
            />
            <span className="absolute left-2 top-5 h-px w-3 bg-violet-300" />
        </div>
    );
}

interface BudgetsTableProps {
    initialBudgets: Budget[];
    initialMeta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export function BudgetsTable({ initialBudgets, initialMeta }: BudgetsTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();
    const isFirstRender = useRef(true);
    const repo = useBudgetsRepository();
    const confirmDialog = useConfirmDialog();

    const [budgets, setBudgets] = useState<Budget[]>(initialBudgets);
    const [meta, setMeta] = useState(initialMeta);
    const [isLoading, setIsLoading] = useState(false);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const [creatingRevisionId, setCreatingRevisionId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [duplicateDialog, setDuplicateDialog] = useState<{ budgetId: string; defaultTitle: string } | null>(null);
    const [duplicateTitle, setDuplicateTitle] = useState("");

    const query = searchParams.get("query") || "";
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 10;
    const sortBy = searchParams.get("sortBy") || "created_at";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const fetchBudgets = async () => {
            setIsLoading(true);
            const result = await repo.list({ page, query, limit, sortBy, sortOrder });
            if (result.success && result.data && result.meta) {
                setBudgets(result.data);
                setMeta(result.meta);
            }
            setIsLoading(false);
        };

        fetchBudgets();
    }, [page, limit, query, sortBy, sortOrder, repo]);

    const openDuplicateDialog = (budget: Budget) => {
        const defaultTitle = `${budget.title || budget.code || "Orçamento"} - Cópia`;
        setDuplicateTitle(defaultTitle);
        setDuplicateDialog({ budgetId: String(budget.id), defaultTitle });
    };

    const handleCreateRevision = async (budget: Budget) => {
        if (!budget.id) return;
        const ok = await confirmDialog({
            title: "Criar revisão",
            description:
                "Criar revisão em andamento a partir deste orçamento? O original permanece bloqueado.",
            confirmLabel: "Criar revisão",
        });
        if (!ok) return;
        setCreatingRevisionId(String(budget.id));
        const res = await repo.createBudgetRevision(String(budget.id));
        setCreatingRevisionId(null);
        if (res.success && res.newBudgetId) {
            toast.success("Revisão criada.");
            router.push(budgetEditUrl(res.newBudgetId));
            return;
        }
        toast.error(res.error || "Erro ao criar revisão");
    };

    const handleDuplicateConfirm = async () => {
        if (!duplicateDialog) return;
        setDuplicatingId(duplicateDialog.budgetId);
        setDuplicateDialog(null);
        const res = await repo.duplicateBudget(duplicateDialog.budgetId, duplicateTitle.trim() || duplicateDialog.defaultTitle);
        setDuplicatingId(null);
        if (res.success) {
            toast.success("Orçamento duplicado!");
            // Recarrega a lista atual
            setIsLoading(true);
            const result = await repo.list({ page, query, limit, sortBy, sortOrder });
            if (result.success && result.data && result.meta) {
                setBudgets(result.data);
                setMeta(result.meta);
            }
            setIsLoading(false);
        } else {
            toast.error(res.error || "Erro ao duplicar orçamento");
        }
    };

    const handleDeleteBudget = async (budget: Budget) => {
        const id = String(budget.id);
        const label = budget.title || budget.code || "este orçamento";
        const ok = await confirmDialog({
            title: "Excluir orçamento",
            description: `Excluir permanentemente o orçamento "${label}"? Esta ação não pode ser desfeita.`,
            confirmLabel: "Excluir",
            destructive: true,
        });
        if (!ok) return;
        setDeletingId(id);
        const res = await repo.deleteBudget(id);
        setDeletingId(null);
        if (res.success) {
            toast.success("Orçamento excluído.");
            setIsLoading(true);
            const result = await repo.list({ page, query, limit, sortBy, sortOrder });
            if (result.success && result.data && result.meta) {
                setBudgets(result.data);
                setMeta(result.meta);
                if (result.data.length === 0 && page > 1) {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("page", String(page - 1));
                    startTransition(() => router.push(`?${params.toString()}`, { scroll: false }));
                }
            }
            setIsLoading(false);
        } else {
            toast.error(res.error || "Erro ao excluir orçamento");
        }
    };

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleLimitChange = (newLimit: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("limit", newLimit);
        params.set("page", "1");
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleSort = (column: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === column) {
            params.set("sortOrder", sortOrder === "asc" ? "desc" : "asc");
        } else {
            params.set("sortBy", column);
            params.set("sortOrder", "asc");
        }
        params.set("page", "1");
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const getSortIcon = (column: string) => {
        if (sortBy !== column) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />;
        }
        return sortOrder === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value || 0);
    };

    const statusBadgeClass = "whitespace-nowrap shrink-0";

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "approved":
                return <Badge className={cn("bg-green-500", statusBadgeClass)}>Aprovado</Badge>;
            case "rejected":
                return <Badge variant="destructive" className={statusBadgeClass}>
                    Recusado
                </Badge>;
            case "sent":
                return <Badge className={cn("bg-blue-500", statusBadgeClass)}>Enviado</Badge>;
            case "finalized":
                return <Badge className={cn("bg-slate-600 text-white", statusBadgeClass)}>Finalizado</Badge>;
            case "draft":
                return <Badge className={cn("bg-emerald-600 text-white", statusBadgeClass)}>Em andamento</Badge>;
            default:
                return (
                    <Badge variant="secondary" className={statusBadgeClass}>
                        {getBudgetStatusLabel(status)}
                    </Badge>
                );
        }
    };

    const formatDate = (date: string | undefined) => {
        if (!date) return "-";
        try {
            return new Date(date).toLocaleDateString("pt-BR");
        } catch {
            return "-";
        }
    };

    const formatCnpjDisplay = (cnpj: string | undefined) => {
        if (!cnpj?.trim()) return "";
        const d = cnpj.replace(/\D/g, "");
        if (d.length !== 14) return cnpj.trim();
        return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
    };

    const clientCell = (budget: Budget) => {
        const name = budget.client_name?.trim();
        const cnpj = formatCnpjDisplay(budget.client_cnpj);
        if (!name && !cnpj) {
            return <span className="text-muted-foreground">—</span>;
        }
        return (
            <div className="min-w-0 max-w-[14rem]">
                {name ? <div className="font-medium leading-snug [overflow-wrap:anywhere]">{name}</div> : null}
                {cnpj ? (
                    <div className="text-xs text-muted-foreground tabular-nums mt-0.5">{cnpj}</div>
                ) : null}
            </div>
        );
    };

    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;
    const currentPage = meta?.page ?? 1;
    const displayRows = useMemo(() => annotateBudgetListRows(budgets), [budgets]);

    const renderRowActions = (budget: Budget) => (
        <div className="flex items-center justify-end gap-2">
            {isBudgetEditableStatus(budget.status) && (
                <Button
                    variant="outline"
                    size="icon"
                    className="rounded-sm h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Excluir orçamento"
                    disabled={
                        deletingId === String(budget.id) ||
                        duplicatingId === String(budget.id) ||
                        creatingRevisionId === String(budget.id)
                    }
                    onClick={() => handleDeleteBudget(budget)}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            )}
            {canShowCreateRevisionButton(budget, budgets) && (
                <Button
                    variant="outline"
                    size="icon"
                    className="rounded-sm h-8 w-8"
                    title="Criar revisão editável"
                    disabled={
                        creatingRevisionId === String(budget.id) ||
                        duplicatingId === String(budget.id) ||
                        deletingId === String(budget.id)
                    }
                    onClick={() => handleCreateRevision(budget)}
                >
                    <GitBranchPlus className="h-4 w-4" />
                </Button>
            )}
            <Button
                variant="outline"
                size="icon"
                className="rounded-sm h-8 w-8"
                title="Duplicar orçamento"
                disabled={
                    duplicatingId === String(budget.id) ||
                    deletingId === String(budget.id) ||
                    creatingRevisionId === String(budget.id)
                }
                onClick={() => openDuplicateDialog(budget)}
            >
                <Copy className="h-4 w-4" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                className="rounded-sm h-8 w-8"
                asChild
                disabled={
                    deletingId === String(budget.id) ||
                    duplicatingId === String(budget.id) ||
                    creatingRevisionId === String(budget.id)
                }
            >
                <a
                    href={budgetEditUrl(String(budget.id))}
                    title={
                        isBudgetEditableStatus(budget.status)
                            ? "Editar orçamento"
                            : "Abrir orçamento (somente leitura)"
                    }
                >
                    {isBudgetEditableStatus(budget.status) ? (
                        <Edit2 className="h-4 w-4" />
                    ) : (
                        <Eye className="h-4 w-4" />
                    )}
                </a>
            </Button>
        </div>
    );

    const renderDesktopRow = (row: BudgetListDisplayRow) => {
        const { budget, isRevision, isLastInBranch } = row;
        const revisionLabel = formatBudgetRevisionBadge(budget.revision_number);

        return (
            <tr
                key={budget.id}
                className={cn(
                    "border-b border-border transition-colors hover:bg-muted/20",
                    isRevision && "bg-violet-50/40 hover:bg-violet-50/60"
                )}
            >
                <td className="p-4 align-middle font-medium">
                    {isRevision ? (
                        <div className="flex items-center text-violet-800">
                            <BudgetListBranch isLast={isLastInBranch} />
                            <span className="text-xs font-semibold uppercase tracking-wide">
                                {revisionLabel}
                            </span>
                        </div>
                    ) : (
                        budget.code || "---"
                    )}
                </td>
                <td className={cn("p-4 align-middle", isRevision && "pl-2")}>
                    <span className={cn(isRevision && "text-sm text-violet-950")}>
                        {budget.title || "---"}
                    </span>
                </td>
                <td className="p-4 align-middle">{clientCell(budget)}</td>
                <td className="p-4 align-middle">
                    <div className="flex justify-center">{getStatusBadge(budget.status)}</div>
                </td>
                <td className="p-4 align-middle">{formatCurrency(budget.total_value)}</td>
                <td className="p-4 align-middle">{formatDate(budget.created_at)}</td>
                <td className="p-4 align-middle">{renderRowActions(budget)}</td>
            </tr>
        );
    };

    const renderMobileCard = (row: BudgetListDisplayRow) => {
        const { budget, isRevision, isLastInBranch } = row;
        const revisionLabel = formatBudgetRevisionBadge(budget.revision_number);

        return (
            <div
                key={budget.id}
                className={cn(
                    "border border-border rounded-sm p-4 bg-card space-y-2",
                    isRevision && "ml-5 border-l-2 border-l-violet-300 bg-violet-50/40"
                )}
            >
                {isRevision ? (
                    <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-violet-800">
                        <BudgetListBranch isLast={isLastInBranch} />
                        {revisionLabel}
                    </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="font-semibold truncate">{budget.title || "Sem título"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                            {isRevision ? `Revisão · ${budget.code || "---"}` : budget.code || "---"}
                        </div>
                        {(budget.client_name?.trim() || formatCnpjDisplay(budget.client_cnpj)) && (
                            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                                {budget.client_name?.trim() ? (
                                    <div className="font-medium text-foreground/80 [overflow-wrap:anywhere]">
                                        {budget.client_name.trim()}
                                    </div>
                                ) : null}
                                {formatCnpjDisplay(budget.client_cnpj) ? (
                                    <div className="tabular-nums">
                                        {formatCnpjDisplay(budget.client_cnpj)}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center">{getStatusBadge(budget.status)}</div>
                </div>
                <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-semibold">{formatCurrency(budget.total_value)}</div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>Criado em</div>
                    <div>{formatDate(budget.created_at)}</div>
                </div>
                <div className="pt-2 flex flex-wrap justify-end gap-2">
                    {isBudgetEditableStatus(budget.status) && (
                        <Button
                            variant="outline"
                            className="rounded-sm text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={
                                deletingId === String(budget.id) ||
                                duplicatingId === String(budget.id) ||
                                creatingRevisionId === String(budget.id)
                            }
                            onClick={() => handleDeleteBudget(budget)}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {deletingId === String(budget.id) ? "Excluindo..." : "Excluir"}
                        </Button>
                    )}
                    {canShowCreateRevisionButton(budget, budgets) && (
                        <Button
                            variant="outline"
                            className="rounded-sm"
                            disabled={
                                creatingRevisionId === String(budget.id) ||
                                duplicatingId === String(budget.id) ||
                                deletingId === String(budget.id)
                            }
                            onClick={() => handleCreateRevision(budget)}
                        >
                            <GitBranchPlus className="h-4 w-4 mr-2" />
                            {creatingRevisionId === String(budget.id) ? "Criando…" : "Revisão"}
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        className="rounded-sm"
                        disabled={
                            duplicatingId === String(budget.id) ||
                            deletingId === String(budget.id) ||
                            creatingRevisionId === String(budget.id)
                        }
                        onClick={() => openDuplicateDialog(budget)}
                    >
                        <Copy className="h-4 w-4 mr-2" />
                        {duplicatingId === String(budget.id) ? "Duplicando..." : "Duplicar"}
                    </Button>
                    <Button
                        variant="outline"
                        className="rounded-sm"
                        asChild
                        disabled={
                            deletingId === String(budget.id) ||
                            duplicatingId === String(budget.id) ||
                            creatingRevisionId === String(budget.id)
                        }
                    >
                        <a href={budgetEditUrl(String(budget.id))}>
                            {isBudgetEditableStatus(budget.status) ? (
                                <>
                                    <Edit2 className="h-4 w-4 mr-2" />
                                    Editar
                                </>
                            ) : (
                                <>
                                    <Eye className="h-4 w-4 mr-2" />
                                    Abrir
                                </>
                            )}
                        </a>
                    </Button>
                </div>
            </div>
        );
    };

    return (
        <>
            {(isLoading || isPending) && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Carregando...
                    </div>
                </div>
            )}

            {/* Desktop Table */}
            <div className="hidden md:block rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/30 border-b border-border">
                        <tr>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[180px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("code")}
                            >
                                <div className="flex items-center">
                                    Código
                                    {getSortIcon("code")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("title")}
                            >
                                <div className="flex items-center">
                                    Título
                                    {getSortIcon("title")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground min-w-[11rem] max-w-[16rem] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("client_name")}
                            >
                                <div className="flex items-center">
                                    Cliente
                                    {getSortIcon("client_name")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-center font-medium text-muted-foreground min-w-[168px] w-[168px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("status")}
                            >
                                <div className="flex items-center justify-center gap-1">
                                    Status
                                    {getSortIcon("status")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[160px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("total_value")}
                            >
                                <div className="flex items-center">
                                    Total
                                    {getSortIcon("total_value")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[140px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("created_at")}
                            >
                                <div className="flex items-center">
                                    Criado em
                                    {getSortIcon("created_at")}
                                </div>
                            </th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground min-w-[132px] w-[132px]">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.length > 0 ? (
                            displayRows.map((row) => renderDesktopRow(row))
                        ) : (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                    {query ? `Nenhum orçamento encontrado para \"${query}\"` : "Nenhum orçamento cadastrado"}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
                {displayRows.length > 0 ? (
                    displayRows.map((row) => renderMobileCard(row))
                ) : (
                    <div className="p-8 text-center text-muted-foreground border border-border rounded-sm">
                        {query ? `Nenhum orçamento encontrado para \"${query}\"` : "Nenhum orçamento cadastrado"}
                    </div>
                )}
            </div>

            {/* Pagination Controls */}
            {displayRows.length > 0 && (
                <div className="flex flex-col gap-4 pt-4 border-t border-border">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground font-medium">
                            Mostrando {(currentPage - 1) * limit + 1}-{Math.min(currentPage * limit, total)} de{" "}
                            {total} propostas
                            {displayRows.some((row) => row.isRevision)
                                ? ` · ${displayRows.length} itens nesta página`
                                : null}
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Itens por página:</span>
                            <select
                                value={limit}
                                onChange={(e) => handleLimitChange(e.target.value)}
                                className="h-9 rounded-sm border border-input bg-background px-3 text-sm"
                                disabled={isLoading || isPending}
                            >
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="text-sm text-muted-foreground font-medium">
                                Página {currentPage} de {totalPages}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    aria-label="Primeira página"
                                    title="Primeira página"
                                >
                                    ««
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    aria-label="Página anterior"
                                    title="Página anterior"
                                >
                                    ‹ <span className="hidden sm:inline ml-1">Anterior</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    aria-label="Próxima página"
                                    title="Próxima página"
                                >
                                    <span className="hidden sm:inline mr-1">Próximo</span> ›
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    aria-label="Última página"
                                    title="Última página"
                                >
                                    »»
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Dialog de duplicação */}
            <Dialog open={!!duplicateDialog} onOpenChange={(open) => { if (!open) setDuplicateDialog(null); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Duplicar orçamento</DialogTitle>
                        <DialogDescription>Informe o nome para o novo orçamento.</DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            autoFocus
                            value={duplicateTitle}
                            onChange={(e) => setDuplicateTitle(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleDuplicateConfirm(); }}
                            placeholder="Nome do orçamento"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDuplicateDialog(null)}>Cancelar</Button>
                        <Button disabled={!duplicateTitle.trim()} onClick={handleDuplicateConfirm}>
                            <Copy className="h-4 w-4 mr-2" />
                            Duplicar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
