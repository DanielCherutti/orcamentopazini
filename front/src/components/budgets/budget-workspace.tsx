"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Info, FileText, Loader2, Map as MapIcon, Mail, Printer, Table2 } from "lucide-react";
import { Budget } from "@/types/budget-types";
import { BudgetTreeV2 } from "./editor/budget-tree-v2";
import { BudgetWorkspaceHeader } from "./workspace/budget-workspace-header";
import { BudgetEmailTab } from "./workspace/budget-email-tab";
import { BudgetEmailSyncProvider } from "./workspace/budget-email-sync-context";
import { toast } from "@/lib/toast";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { getBudgetAction, getBudgetShellAction } from "@/actions/budget-actions";
import { updateBudgetAction } from "@/actions/budget-core-write-actions";
import { getCompositorPanelLabel } from "@/components/budgets/compositor/compositor-content-utils";
import { budgetPdfUrl } from "@/lib/budgets/budget-path";
import {
    canUseBudgetEmail,
    getBudgetStatusLabel,
    isBudgetEditableStatus,
} from "@/lib/budgets/budget-status";
import { cn } from "@/lib/utils";
import { WorkspaceContext, type ActiveTab } from "./workspace-context";

function BudgetTabLoading() {
    return (
        <div className="flex flex-1 min-h-[12rem] items-center justify-center bg-white">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
        </div>
    );
}

const BudgetCompositor = dynamic(
    () =>
        import("@/components/budgets/compositor/budget-compositor").then((m) => ({
            default: m.BudgetCompositor,
        })),
    { loading: () => <BudgetTabLoading /> }
);

const BudgetScope = dynamic(
    () =>
        import("@/components/budgets/scope/budget-scope").then((m) => ({
            default: m.BudgetScope,
        })),
    { loading: () => <BudgetTabLoading /> }
);

const BudgetQuoteTab = dynamic(
    () =>
        import("@/components/budgets/quote/budget-quote-tab").then((m) => ({
            default: m.BudgetQuoteTab,
        })),
    { loading: () => <BudgetTabLoading /> }
);

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'budget',  label: 'Compositor', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'scope',   label: 'Adequações',    icon: <MapIcon className="h-3.5 w-3.5" /> },
    { id: 'quote',   label: 'Orçamento', icon: <Table2 className="h-3.5 w-3.5" /> },
    { id: 'print',   label: 'Impressão', icon: <Printer className="h-3.5 w-3.5" /> },
    { id: 'email',   label: 'E-mail', icon: <Mail className="h-3.5 w-3.5" /> },
];

interface BudgetWorkspaceProps {
    initialBudget: Budget;
    /** Carregamento inicial usou só shell (orçamento grande); refresh do header evita o grafo completo. */
    initialUseLightScopeRead?: boolean;
    mode?: 'create' | 'edit';
}

type EnvironmentsContextType = {
    environmentsExpanded: boolean;
    toggleEnvironmentsExpanded: () => void;
};

const EnvironmentsContext = createContext<EnvironmentsContextType | null>(null);

export function BudgetWorkspace({
    initialBudget,
    initialUseLightScopeRead = false,
    mode: _mode = 'edit',
}: BudgetWorkspaceProps) {
    const [budget, setBudget] = useState<Budget>(initialBudget);
    const [useLightScopeRead] = useState(Boolean(initialUseLightScopeRead));
    const [hasChanges, setHasChanges] = useState(false);
    const [environmentsExpanded, setEnvironmentsExpanded] = useState(false);
    const searchParams = useSearchParams();
    const [activeTab, setActiveTab] = useState<ActiveTab>("budget");
    const repo = useBudgetsRepository();

    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab === "email" && canUseBudgetEmail(budget.status)) {
            setActiveTab("email");
        }
    }, [searchParams, budget.status]);

    const toggleEnvironmentsExpanded = () => setEnvironmentsExpanded((prev) => !prev);

    useEffect(() => {
        setBudget(initialBudget);
    }, [initialBudget]);

    const isReadOnly = !isBudgetEditableStatus(budget.status);
    const emailEnabled = canUseBudgetEmail(budget.status);

    useEffect(() => {
        if (activeTab === "email" && !canUseBudgetEmail(budget.status)) {
            setActiveTab("budget");
        }
    }, [activeTab, budget.status]);

    const handleRefresh = async () => {
        const id = budget.id as string;
        const result = useLightScopeRead
            ? await getBudgetShellAction(id)
            : await getBudgetAction(id);
        if (result.success && result.data) {
            setBudget(result.data as Budget);
        }
        setHasChanges(false);
    };

    const handleSave = async () => {
        try {
            const budgetId = budget.id as string;
            if (!budgetId) { toast.error("ID do compositor inválido"); return; }
            const result = await repo.updateBudget(budgetId, budget);
            if (result.success) {
                toast.success("Compositor salvo com sucesso!");
                setHasChanges(false);
                await handleRefresh();
            } else {
                toast.error(result.error || "Erro ao salvar compositor");
            }
        } catch {
            toast.error("Erro ao salvar compositor");
        }
    };

    const useCompositor = !!initialBudget.use_compositor;
    const budgetId = budget.id as string;
    const pdfUrl = budgetPdfUrl(budgetId);

    const handleCompositorLabelChange = useCallback(
        async (label: string) => {
            const res = await updateBudgetAction(budgetId, { compositor_label: label });
            if (res.success) {
                setBudget((prev) => ({ ...prev, compositor_label: label }));
            } else {
                toast.error(res.error || "Erro ao renomear Compositor");
            }
        },
        [budgetId],
    );

    return (
        <WorkspaceContext.Provider value={{ activeTab, setActiveTab }}>
            <EnvironmentsContext.Provider value={{ environmentsExpanded, toggleEnvironmentsExpanded }}>
                <div className="flex flex-col fixed inset-x-0 bottom-0 top-[var(--support-banner-height,0px)] z-40 bg-background">
                    {/* Barra unificada: back + título + abas + ações */}
                    <BudgetWorkspaceHeader
                        budget={budget}
                        hasChanges={hasChanges}
                        onSave={handleSave}
                        onOpenPreview={() => window.open(pdfUrl, "_blank")}
                        onBudgetRefresh={handleRefresh}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        tabs={TABS}
                    />

                    {/* Banner para compositores fora de “em andamento” */}
                    {isReadOnly && (
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800 shrink-0">
                            <Info className="h-4 w-4 shrink-0" />
                            {budget.status === "finalized" ? (
                                <>
                                    Este compositor está <strong>finalizado</strong> e não pode mais ser editado — apenas visualizado, pré-visualização e PDF. Use <strong>Criar revisão</strong> para abrir uma cópia editável abaixo desta proposta (mesmo código).
                                </>
                            ) : (
                                <>
                                    Este compositor está em status <strong>{getBudgetStatusLabel(String(budget.status))}</strong> e não pode mais ser editado. Use <strong>Criar revisão</strong> para uma cópia editável ligada a esta proposta.
                                </>
                            )}
                        </div>
                    )}

                    {useCompositor ? (
                        <BudgetEmailSyncProvider budgetId={budgetId} enabled={emailEnabled}>
                            {/* Conteúdo das abas */}
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {/* Aba Compositor */}
                                <div className={cn("flex-1 flex min-h-0 overflow-hidden bg-white", activeTab !== 'budget' && "hidden")}>
                                    <BudgetCompositor
                                        budgetId={budgetId}
                                        budgetCode={budget.code}
                                        compositorLabel={getCompositorPanelLabel(budget.compositor_label)}
                                        onCompositorLabelChange={
                                            isReadOnly ? undefined : handleCompositorLabelChange
                                        }
                                        isReadOnly={isReadOnly}
                                    />
                                </div>

                                {/* Aba Escopo */}
                                {activeTab === 'scope' && (
                                    <div className="flex-1 flex min-h-0 overflow-hidden bg-white">
                                        <BudgetScope
                                            budgetId={budgetId}
                                            isReadOnly={isReadOnly}
                                        />
                                    </div>
                                )}

                                {activeTab === 'quote' && (
                                    <div className="flex-1 flex min-h-0 overflow-hidden bg-white">
                                        <BudgetQuoteTab
                                            budgetId={budgetId}
                                            isReadOnly={isReadOnly}
                                            onBudgetRefresh={handleRefresh}
                                        />
                                    </div>
                                )}

                                {/* Aba Impressão */}
                                {activeTab === 'print' && (
                                    <div className="flex-1 flex flex-col min-h-0 bg-slate-100">
                                        <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0">
                                            <span className="text-sm text-muted-foreground">Pré-visualização do PDF</span>
                                            <a
                                                href={pdfUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm font-medium text-primary hover:underline"
                                            >
                                                Baixar PDF ↗
                                            </a>
                                        </div>
                                        <iframe
                                            src={pdfUrl}
                                            className="flex-1 w-full border-0"
                                            title="PDF do compositor"
                                        />
                                    </div>
                                )}

                                {activeTab === "email" && emailEnabled && (
                                    <div className="flex-1 flex min-h-0 overflow-hidden">
                                        <BudgetEmailTab budget={budget} />
                                    </div>
                                )}
                            </div>
                        </BudgetEmailSyncProvider>
                    ) : (
                        /* Editor legado (sem abas) */
                        <div className="flex-1 flex flex-col min-h-0 bg-white overflow-hidden">
                            <div className="shrink-0 p-4 pb-2 border-b">
                                <h2 className="text-xl font-bold text-foreground">Ambientes e Produtos</h2>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Organize os produtos por ambiente e trecho.
                                </p>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto">
                                <BudgetTreeV2 budget={budget} onRefresh={handleRefresh} isReadOnly={isReadOnly} />
                            </div>
                        </div>
                    )}
                </div>
            </EnvironmentsContext.Provider>
        </WorkspaceContext.Provider>
    );
}

export function useEnvironmentsExpanded() {
    const context = useContext(EnvironmentsContext);
    if (!context) {
        throw new Error("useEnvironmentsExpanded must be used within BudgetWorkspace");
    }
    return context;
}

export { useWorkspaceTab } from "./workspace-context";
