"use client";

import { useEffect, useState } from "react";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";
import { useScopeFiguresFromProvider } from "@/components/budgets/scope/scope-figures-context";

/**
 * Mapa imagem → número da figura (1…N) na ordem da lista de figuras do documento.
 * Dentro de `ScopeFiguresProvider` (aba Escopo), usa um único fetch por orçamento/versão.
 * Fora do provider (editor legado / compositor), mantém fetch com `refreshKey`.
 */
export function useScopeFigureNumbers(budgetId: string, refreshKey: string) {
    const providerCtx = useScopeFiguresFromProvider();
    const [figureNumbersByImageId, setFigureNumbersByImageId] = useState<Record<string, number>>(
        {}
    );

    useEffect(() => {
        if (providerCtx != null) {
            return;
        }
        let cancelled = false;
        getScopeFiguresListAction(budgetId).then((res) => {
            if (cancelled || !res.success || !res.entries) return;
            const m: Record<string, number> = {};
            res.entries.forEach((e, i) => {
                m[e.id] = i + 1;
            });
            setFigureNumbersByImageId(m);
        });
        return () => {
            cancelled = true;
        };
    }, [budgetId, refreshKey, providerCtx]);

    if (providerCtx?.ready) {
        return providerCtx.figureNumbersByImageId;
    }
    if (providerCtx != null && !providerCtx.ready) {
        return {};
    }
    return figureNumbersByImageId;
}
