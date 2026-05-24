import type { BudgetEmailSyncImportDto } from "@/actions/budget-email-actions";

export type BudgetEmailNotification = {
    id: string;
    budgetId: string;
    code?: string;
    count: number;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
};

const STORAGE_KEY = "pazini-budget-email-notifications";
const MAX_ITEMS = 40;

function notificationCopy(row: BudgetEmailSyncImportDto): Pick<
    BudgetEmailNotification,
    "title" | "body"
> {
    const label = row.code ? `Orçamento ${row.code}` : "Orçamento";
    if (row.count === 1) {
        return {
            title: "Nova resposta por e-mail",
            body: `O cliente respondeu em ${label}.`,
        };
    }
    return {
        title: `${row.count} novas respostas`,
        body: `Novas mensagens do cliente em ${label}.`,
    };
}

export function buildNotificationsFromImports(
    imports: BudgetEmailSyncImportDto[]
): BudgetEmailNotification[] {
    const now = Date.now();
    return imports
        .filter((row) => row.count > 0)
        .map((row, index) => {
            const copy = notificationCopy(row);
            return {
                id: `${row.budgetId}-${now}-${index}`,
                budgetId: row.budgetId,
                code: row.code,
                count: row.count,
                title: copy.title,
                body: copy.body,
                createdAt: new Date(now + index).toISOString(),
                read: false,
            };
        });
}

export function loadStoredNotifications(): BudgetEmailNotification[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as BudgetEmailNotification[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((n) => n?.id && n?.budgetId);
    } catch {
        return [];
    }
}

export function saveStoredNotifications(items: BudgetEmailNotification[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(items.slice(0, MAX_ITEMS))
        );
    } catch {
        /* quota / private mode */
    }
}

export function mergeNotifications(
    current: BudgetEmailNotification[],
    incoming: BudgetEmailNotification[]
): BudgetEmailNotification[] {
    if (incoming.length === 0) return current;
    return [...incoming, ...current].slice(0, MAX_ITEMS);
}

export function countUnread(items: BudgetEmailNotification[]): number {
    return items.filter((n) => !n.read).length;
}
