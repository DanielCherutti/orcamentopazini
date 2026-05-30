"use client";

import { useEffect } from "react";

export function useLiveCompositor(budgetId: string, onRefresh: () => void) {
  useEffect(() => {
    const es = new EventSource(`/api/compositor/${budgetId}/live`);
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        onRefresh();
      }, 250);
    };

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { type: string };
        if (payload.type === "block" || payload.type === "item") {
          scheduleRefresh();
        }
      } catch {
        // keepalive ou evento malformado — ignorar
      }
    };

    es.onerror = () => {
      // EventSource reconecta automaticamente — sem lógica extra necessária
    };

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      es.close();
    };
  // onRefresh é estável via useCallback no componente pai — excluir do dep array é seguro
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId]);
}
