"use client";

import { useState, useEffect, createContext, useContext } from "react";
import { Info, FileText, Map as MapIcon, Printer } from "lucide-react";
import { Budget } from "@/types/budget-types";
import { BudgetTreeV2 } from "./editor/budget-tree-v2";
import { BudgetCompositor } from "./compositor/budget-compositor";
import { BudgetScope } from "./scope/budget-scope";
import { BudgetWorkspaceHeader } from "./workspace/budget-workspace-header";
import { toast } from "@/lib/toast";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { getBudgetAction } from "@/actions/budget-actions";
import { budgetPdfUrl } from "@/lib/budgets/budget-path";
import { getBudgetStatusLabel, isBudgetEditableStatus } from "@/lib/budgets/budget-status";
import { cn } from "@/lib/utils";
import { WorkspaceContext, type ActiveTab } from "./workspace-context";

const TABS: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'budget',  label: 'Orçamento', icon: <FileText className="h-3.5 w-3.5" /> },
    { id: 'scope',   label: 'Escopo',    icon: <MapIcon className="h-3.5 w-3.5" /> },
    { id: 'print',   label: 'Impressão', icon: <Printer className="h-3.5 w-3.5" /> },
];

interface BudgetWorkspaceProps {
    initialBudget: Budget;
    mode?: 'create' | 'edit';
}

type EnvironmentsContextType = {
    environmentsExpanded: boolean;
    toggleEnvironmentsExpanded: () => void;
};

const EnvironmentsContext = createContext<EnvironmentsContextType | null>(null);

export function BudgetWorkspace({ initialBudget, mode: _mode = 'edit' }: BudgetWorkspaceProps) {
    const [budget, setBudget] = useState<Budget>(initialBudget);
    const [hasChanges, setHasChanges] = useState(false);
    const [environmentsExpanded, setEnvironmentsExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState<ActiveTab>('budget');
    const repo = useBudgetsRepository();

    const toggleEnvironmentsExpanded = () => setEnvironmentsExpanded((prev) => !prev);

    useEffect(() => {
        setBudget(initialBudget);
    }, [initialBudget]);

    const isReadOnly = !isBudgetEditableStatus(budget.status);

    const handleRefresh = async () => {
        const id = budget.id as string;
        const result = await getBudgetAction(id);
        if (result.success && result.data) {
            setBudget(result.data as Budget);
        }
        setHasChanges(false);
    };

    const handleSave = async () => {
        try {
            const budgetId = budget.id as string;
            if (!budgetId) { toast.error("ID do orçamento inválido"); return; }
            const result = await repo.updateBudget(budgetId, budget);
            if (result.success) {
                toast.success("Orçamento salvo com sucesso!");
                setHasChanges(false);
                await handleRefresh();
            } else {
                toast.error(result.error || "Erro ao salvar orçamento");
            }
        } catch {
            toast.error("Erro ao salvar orçamento");
        }
    };

    const useCompositor = !!initialBudget.use_compositor;
    const budgetId = budget.id as string;
    const pdfUrl = budgetPdfUrl(budgetId);

    return (
        <WorkspaceContext.Provider value={{ activeTab, setActiveTab }}>
            <EnvironmentsContext.Provider value={{ environmentsExpanded, toggleEnvironmentsExpanded }}>
                <div className="flex flex-col fixed inset-0 z-40 bg-background">
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

                    {/* Banner para orçamentos fora de “em andamento” */}
                    {isReadOnly && (
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2 text-sm text-amber-800 shrink-0">
                            <Info className="h-4 w-4 shrink-0" />
                            {budget.status === "finalized" ? (
                                <>
                                    Este orçamento está <strong>finalizado</strong> e não pode mais ser editado — apenas visualizado, pré-visualização e PDF. Duplique para criar uma nova versão em andamento.
                                </>
                            ) : (
                                <>
                                    Este orçamento está em status <strong>{getBudgetStatusLabel(String(budget.status))}</strong> e não pode mais ser editado. Duplique para criar uma nova versão em andamento.
                                </>
                            )}
                        </div>
                    )}

                    {useCompositor ? (
                        <>
                            {/* Conteúdo das abas */}
                            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                {/* Aba Orçamento */}
                                <div className={cn("flex-1 flex min-h-0 overflow-hidden bg-white", activeTab !== 'budget' && "hidden")}>
                                    <BudgetCompositor budgetId={budgetId} isReadOnly={isReadOnly} />
                                </div>

                                {/* Aba Escopo */}
                                {activeTab === 'scope' && (
                                    <div className="flex-1 flex min-h-0 overflow-hidden bg-white">
                                        <BudgetScope budgetId={budgetId} isReadOnly={isReadOnly} />
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
                                            title="PDF do orçamento"
                                        />
                                    </div>
                                )}
                            </div>
                        </>
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
