"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { syncBudgetEmailRepliesAction } from "@/actions/budget-email-actions";
import { useGlobalBudgetEmailSyncOptional } from "@/components/providers/global-budget-email-sync";
import { toast } from "@/lib/toast";

type SyncListener = () => void;

type SyncResult = Awaited<ReturnType<typeof syncBudgetEmailRepliesAction>>;

type BudgetEmailSyncContextValue = {
    syncing: boolean;
    syncInbox: (opts?: { notify?: boolean; background?: boolean }) => Promise<SyncResult | void>;
    subscribeConversationRefresh: (listener: SyncListener) => () => void;
};

const BudgetEmailSyncContext = createContext<BudgetEmailSyncContextValue | null>(null);

export function useBudgetEmailSyncOptional(): BudgetEmailSyncContextValue | null {
    return useContext(BudgetEmailSyncContext);
}

export function useBudgetEmailSync(): BudgetEmailSyncContextValue {
    const ctx = useContext(BudgetEmailSyncContext);
    if (!ctx) {
        throw new Error("useBudgetEmailSync deve ser usado dentro de BudgetEmailSyncProvider");
    }
    return ctx;
}

export function BudgetEmailSyncProvider({
    budgetId,
    enabled = true,
    children,
}: {
    budgetId: string;
    /** Só orçamento finalizado (e-mail liberado). */
    enabled?: boolean;
    children: ReactNode;
}) {
    if (!enabled) {
        return <>{children}</>;
    }

    return (
        <BudgetEmailSyncProviderInner budgetId={budgetId}>
            {children}
        </BudgetEmailSyncProviderInner>
    );
}

function BudgetEmailSyncProviderInner({
    budgetId,
    children,
}: {
    budgetId: string;
    children: ReactNode;
}) {
    const globalSync = useGlobalBudgetEmailSyncOptional();
    const [syncing, setSyncing] = useState(false);
    const listenersRef = useRef(new Set<SyncListener>());
    const syncInFlightRef = useRef(false);
    const mountedRef = useRef(true);

    const notifyListeners = useCallback(() => {
        listenersRef.current.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.error("[budget-email-sync] listener:", e);
            }
        });
    }, []);

    const subscribeConversationRefresh = useCallback((listener: SyncListener) => {
        listenersRef.current.add(listener);
        return () => {
            listenersRef.current.delete(listener);
        };
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!globalSync) return;
        return globalSync.subscribeBudgetRefresh(budgetId, notifyListeners);
    }, [globalSync, budgetId, notifyListeners]);

    const syncInbox = useCallback(
        async (opts?: { notify?: boolean; background?: boolean }) => {
            if (syncInFlightRef.current) return;
            syncInFlightRef.current = true;
            const showSpinner = !opts?.background;
            if (showSpinner && mountedRef.current) setSyncing(true);

            try {
                const syncRes = await syncBudgetEmailRepliesAction(budgetId);
                notifyListeners();

                const imported = syncRes.success ? (syncRes.imported ?? 0) : 0;

                if (opts?.background) {
                    if (imported > 0 && mountedRef.current) {
                        toast.success(
                            imported === 1
                                ? "Nova resposta do cliente."
                                : `${imported} novas respostas do cliente.`
                        );
                    }
                    return syncRes;
                }

                if (!opts?.notify) return syncRes;
                if (!mountedRef.current) return syncRes;

                if (syncRes.success) {
                    if (imported > 0) {
                        toast.success(
                            imported === 1
                                ? "1 nova resposta importada."
                                : `${syncRes.imported} novas respostas importadas.`
                        );
                    } else {
                        toast.info("Nenhuma resposta nova na caixa configurada.");
                    }
                } else if (syncRes.error) {
                    toast.error(syncRes.error);
                }
                return syncRes;
            } finally {
                syncInFlightRef.current = false;
                if (showSpinner && mountedRef.current) setSyncing(false);
            }
        },
        [budgetId, notifyListeners]
    );

    const value: BudgetEmailSyncContextValue = {
        syncing,
        syncInbox,
        subscribeConversationRefresh,
    };

    return (
        <BudgetEmailSyncContext.Provider value={value}>{children}</BudgetEmailSyncContext.Provider>
    );
}
