"use client";

import { useEnvironmentsExpanded } from "@/components/budgets/budget-workspace";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, X } from "lucide-react";

/**
 * Controle de colapso/expansão do topo da área de ambientes.
 * Permite maximizar o espaço vertical disponível para os locais e trechos.
 */
export function EnvironmentsToggle() {
    const { environmentsExpanded, toggleEnvironmentsExpanded } = useEnvironmentsExpanded();

    return (
        <button
            type="button"
            onClick={toggleEnvironmentsExpanded}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors border-b"
        >
            {environmentsExpanded ? (
                <>
                    <span>Recuar cabeçalho</span>
                    <ChevronDown className="h-4 w-4" />
                </>
            ) : (
                <>
                    <span>Expandir cabeçalho</span>
                    <ChevronRight className="h-4 w-4" />
                </>
            )}
        </button>
    );
}
