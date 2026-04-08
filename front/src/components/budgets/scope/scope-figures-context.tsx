"use client";

import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";

type ScopeFiguresContextValue = {
    /** Mapa imagem id → número da figura no documento */
    figureNumbersByImageId: Record<string, number>;
    ready: boolean;
};

const ScopeFiguresContext = createContext<ScopeFiguresContextValue | null>(null);

export function ScopeFiguresProvider({
    budgetId,
    scopeDataVersion,
    children,
}: {
    budgetId: string;
    scopeDataVersion: number;
    children: ReactNode;
}) {
    const [figureNumbersByImageId, setFigureNumbersByImageId] = useState<Record<string, number>>(
        {}
    );
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setReady(false);
        getScopeFiguresListAction(budgetId).then((res) => {
            if (cancelled) return;
            const m: Record<string, number> = {};
            if (res.success && res.entries) {
                res.entries.forEach((e, i) => {
                    m[e.id] = i + 1;
                });
            }
            setFigureNumbersByImageId(m);
            setReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [budgetId, scopeDataVersion]);

    const value = useMemo(
        () => ({ figureNumbersByImageId, ready }),
        [figureNumbersByImageId, ready]
    );

    return <ScopeFiguresContext.Provider value={value}>{children}</ScopeFiguresContext.Provider>;
}

export function useScopeFiguresFromProvider(): ScopeFiguresContextValue | null {
    return useContext(ScopeFiguresContext);
}
