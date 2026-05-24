"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    hasActiveBudgetEmailSyncAction,
    syncAllBudgetEmailRepliesAction,
    type BudgetEmailSyncImportDto,
} from "@/actions/budget-email-actions";
import {
    buildNotificationsFromImports,
    countUnread,
    loadStoredNotifications,
    mergeNotifications,
    saveStoredNotifications,
    type BudgetEmailNotification,
} from "@/lib/budgets/budget-email-notifications";

const EMAIL_AUTO_SYNC_MS = 120_000;
const EMAIL_AUTO_SYNC_MIN_GAP_MS = 60_000;

type BudgetRefreshListener = () => void;

type GlobalBudgetEmailSyncValue = {
    subscribeBudgetRefresh: (budgetId: string, listener: BudgetRefreshListener) => () => void;
    notifyOutboundSent: () => void;
    notifications: BudgetEmailNotification[];
    unreadCount: number;
    popoverOpen: boolean;
    setPopoverOpen: (open: boolean) => void;
    markNotificationRead: (id: string) => void;
    markAllNotificationsRead: () => void;
    clearNotifications: () => void;
};

const GlobalBudgetEmailSyncContext = createContext<GlobalBudgetEmailSyncValue | null>(null);

export function useGlobalBudgetEmailSyncOptional(): GlobalBudgetEmailSyncValue | null {
    return useContext(GlobalBudgetEmailSyncContext);
}

export function GlobalBudgetEmailSyncProvider({ children }: { children: ReactNode }) {
    const listenersRef = useRef(new Map<string, Set<BudgetRefreshListener>>());
    const syncInFlightRef = useRef(false);
    const lastAutoSyncAtRef = useRef(0);
    const mountedRef = useRef(true);

    const [notifications, setNotifications] = useState<BudgetEmailNotification[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [popoverOpen, setPopoverOpen] = useState(false);

    useEffect(() => {
        setNotifications(loadStoredNotifications());
        setHydrated(true);
    }, []);

    const persistNotifications = useCallback((items: BudgetEmailNotification[]) => {
        setNotifications(items);
        saveStoredNotifications(items);
    }, []);

    const pushNotifications = useCallback(
        (imports: BudgetEmailSyncImportDto[]) => {
            const incoming = buildNotificationsFromImports(imports);
            if (incoming.length === 0) return;

            setNotifications((prev) => {
                const merged = mergeNotifications(prev, incoming);
                saveStoredNotifications(merged);
                return merged;
            });
            setPopoverOpen(true);
        },
        []
    );

    const unreadCount = useMemo(
        () => (hydrated ? countUnread(notifications) : 0),
        [hydrated, notifications]
    );

    const markNotificationRead = useCallback(
        (id: string) => {
            setNotifications((prev) => {
                const next = prev.map((n) => (n.id === id ? { ...n, read: true } : n));
                saveStoredNotifications(next);
                return next;
            });
        },
        []
    );

    const markAllNotificationsRead = useCallback(() => {
        setNotifications((prev) => {
            const next = prev.map((n) => ({ ...n, read: true }));
            saveStoredNotifications(next);
            return next;
        });
    }, []);

    const clearNotifications = useCallback(() => {
        persistNotifications([]);
    }, [persistNotifications]);

    const notifyBudget = useCallback((budgetId: string) => {
        const set = listenersRef.current.get(budgetId);
        if (!set) return;
        set.forEach((fn) => {
            try {
                fn();
            } catch (e) {
                console.error("[global-budget-email-sync] listener:", e);
            }
        });
    }, []);

    const subscribeBudgetRefresh = useCallback(
        (budgetId: string, listener: BudgetRefreshListener) => {
            const key = budgetId.trim();
            if (!key) return () => undefined;

            let set = listenersRef.current.get(key);
            if (!set) {
                set = new Set();
                listenersRef.current.set(key, set);
            }
            set.add(listener);

            return () => {
                const current = listenersRef.current.get(key);
                if (!current) return;
                current.delete(listener);
                if (current.size === 0) listenersRef.current.delete(key);
            };
        },
        []
    );

    const runSync = useCallback(
        async (opts?: { background?: boolean }) => {
            if (syncInFlightRef.current) return;

            syncInFlightRef.current = true;
            try {
                const syncRes = await syncAllBudgetEmailRepliesAction();
                if (!mountedRef.current || !syncRes.success) return syncRes;

                const imports = (syncRes.imports ?? []).filter((row) => row.count > 0);
                if (imports.length > 0) {
                    for (const row of imports) {
                        notifyBudget(row.budgetId);
                    }
                    if (opts?.background) {
                        pushNotifications(imports);
                    }
                }

                return syncRes;
            } finally {
                syncInFlightRef.current = false;
            }
        },
        [notifyBudget, pushNotifications]
    );

    const notifyOutboundSent = useCallback(() => {
        lastAutoSyncAtRef.current = 0;
        void runSync({ background: true });
    }, [runSync]);

    const runAutoSyncIfDue = useCallback(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
            return;
        }
        const now = Date.now();
        if (now - lastAutoSyncAtRef.current < EMAIL_AUTO_SYNC_MIN_GAP_MS) return;
        lastAutoSyncAtRef.current = now;
        void runSync({ background: true });
    }, [runSync]);

    useEffect(() => {
        mountedRef.current = true;
        let cancelled = false;

        (async () => {
            const check = await hasActiveBudgetEmailSyncAction();
            if (cancelled || !mountedRef.current) return;
            if (check.success && check.active) {
                lastAutoSyncAtRef.current = Date.now();
                void runSync({ background: true });
            }
        })();

        const intervalId = window.setInterval(runAutoSyncIfDue, EMAIL_AUTO_SYNC_MS);

        const onVisibility = () => {
            if (document.visibilityState === "visible") runAutoSyncIfDue();
        };
        document.addEventListener("visibilitychange", onVisibility);

        return () => {
            cancelled = true;
            mountedRef.current = false;
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [runAutoSyncIfDue, runSync]);

    const value: GlobalBudgetEmailSyncValue = {
        subscribeBudgetRefresh,
        notifyOutboundSent,
        notifications: hydrated ? notifications : [],
        unreadCount,
        popoverOpen,
        setPopoverOpen,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
    };

    return (
        <GlobalBudgetEmailSyncContext.Provider value={value}>
            {children}
        </GlobalBudgetEmailSyncContext.Provider>
    );
}
