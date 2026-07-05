"use client";

import { useEffect } from "react";

const DEBOUNCE_MS = 600;
const MIN_REFRESH_INTERVAL_MS = 1500;

export function useLiveCompositor(
    budgetId: string,
    onRefresh: () => void,
    enabled = true,
) {
    useEffect(() => {
        if (!enabled || !budgetId) return;

        const es = new EventSource(`/api/compositor/${budgetId}/live`);
        let refreshTimer: ReturnType<typeof setTimeout> | null = null;
        let lastRefreshAt = 0;
        let pending = false;

        const runRefresh = () => {
            pending = false;
            lastRefreshAt = Date.now();
            onRefresh();
        };

        const scheduleRefresh = () => {
            pending = true;
            if (refreshTimer) return;

            const elapsed = Date.now() - lastRefreshAt;
            const wait = Math.max(DEBOUNCE_MS, MIN_REFRESH_INTERVAL_MS - elapsed);

            refreshTimer = setTimeout(() => {
                refreshTimer = null;
                if (!pending) return;
                runRefresh();
            }, wait);
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
            // EventSource reconecta automaticamente
        };

        return () => {
            pending = false;
            if (refreshTimer) clearTimeout(refreshTimer);
            es.close();
        };
        // onRefresh estável via useCallback no pai
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [budgetId, enabled]);
}
