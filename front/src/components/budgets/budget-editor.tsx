"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Budget } from "@/types/budget-types";
import { BudgetTreeV2 } from "./editor/budget-tree-v2";

interface BudgetEditorProps {
    initialBudget: Budget;
}

export function BudgetEditor({ initialBudget }: BudgetEditorProps) {
    const [budget, setBudget] = useState<Budget>(initialBudget);
    const router = useRouter();

    // Sincronizar estado local quando o servidor atualizar (após router.refresh)
    useEffect(() => {
        setBudget(initialBudget);
    }, [initialBudget]);

    const handleRefresh = () => {
        router.refresh();
    };

    return (
        <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-8 scrollbar-thin">
            <div className="max-w-6xl mx-auto">
                <BudgetTreeV2 budget={budget} onRefresh={handleRefresh} />
            </div>
        </div>
    );
}
