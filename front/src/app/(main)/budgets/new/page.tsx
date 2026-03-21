"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useBudgetsRepository } from "@/lib/budgets/use-budgets-repository";
import { budgetIdToPath } from "@/lib/budgets/budget-path";

/**
 * Página /budgets/new
 * Esta página cria um rascunho vazio e redireciona para o workspace unificado em /budgets/[id].
 * 
 * Fluxo:
 * 1. Usuário acessa /budgets/new
 * 2. Sistema cria rascunho com client_id vazio (será preenchido no workspace)
 * 3. Redirect automático para /budgets/budget/[id] onde terá acesso ao workspace completo
 */
export default function NewBudgetPage() {
    const router = useRouter();
    const repo = useBudgetsRepository();
    const didRun = useRef(false);

    useEffect(() => {
        if (didRun.current) return;
        didRun.current = true;

        async function createDraftAndRedirect() {
            try {
                const result = await repo.createDraft();

                if (result.success && result.data?.id) {
                    // Redireciona para o workspace
                    router.replace(`/budgets/budget/${budgetIdToPath(String(result.data.id))}`);
                } else {
                    toast.error(result.error || "Falha ao criar orçamento");
                    // Volta para listagem em caso de erro
                    router.replace("/budgets");
                }
            } catch (error) {
                console.error("Erro ao criar rascunho:", error);
                toast.error("Ocorreu um erro inesperado.");
                router.replace("/budgets");
            }
        }

        createDraftAndRedirect();
    }, [router, repo]);

    // Loading state enquanto cria e redireciona
    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] items-center justify-center">
            <div className="w-full max-w-md space-y-6 text-center">
                <div className="space-y-2">
                    <h2 className="text-2xl font-bold">Criando Orçamento...</h2>
                    <p className="text-muted-foreground">
                        Preparando o workspace para você.
                    </p>
                </div>

                <div className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-24 w-full" />
                </div>
            </div>
        </div>
    );
}
