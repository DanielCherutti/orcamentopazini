"use client";

import { useEffect, useState } from "react";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";

/**
 * Mapa imagem → número da figura (1…N) na ordem da lista de figuras do documento
 * (mesma ordem de `getScopeFiguresListAction`, alinhada ao PDF).
 */
export function useScopeFigureNumbers(budgetId: string, refreshKey: string) {
  const [figureNumbersByImageId, setFigureNumbersByImageId] = useState<Record<string, number>>({});

  useEffect(() => {
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
  }, [budgetId, refreshKey]);

  return figureNumbersByImageId;
}
