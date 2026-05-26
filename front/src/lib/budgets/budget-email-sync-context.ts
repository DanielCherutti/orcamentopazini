import {
    collectAllKnownMessageIds,
    collectAllParticipantEmails,
    collectKnownMessageIdsForBudget,
    collectParticipantEmailsForBudget,
    listThreadIdsWithOutboundForBudget,
    listThreadsForBudget,
    listThreadsWithOutbound,
    type BudgetEmailThreadRow,
} from "@/lib/budgets/budget-email-store";
import { canonicalTableRecordId } from "@/lib/surreal-record-ids";

export type EmailSyncContext = {
    threads: BudgetEmailThreadRow[];
    knownIds: Set<string>;
    participantEmails: Set<string>;
    threadIdsWithOutbound: Set<string>;
    /** Quando definido, ignora threads de outros orçamentos. */
    scopeBudgetKey: string | null;
};

/** @deprecated Use EmailSyncContext */
export type BudgetSyncContext = EmailSyncContext & {
    budgetId: string;
    budgetKey: string;
};

export async function buildSyncContext(budgetId: string): Promise<BudgetSyncContext> {
    const threads = await listThreadsForBudget(budgetId);
    const knownIds = await collectKnownMessageIdsForBudget(budgetId);
    const threadIdsWithOutbound = await listThreadIdsWithOutboundForBudget(budgetId);

    return {
        budgetId,
        budgetKey: canonicalTableRecordId("budget", budgetId),
        threads,
        knownIds,
        participantEmails: await collectParticipantEmailsForBudget(budgetId),
        threadIdsWithOutbound,
        scopeBudgetKey: canonicalTableRecordId("budget", budgetId),
    };
}

export async function buildGlobalSyncContext(): Promise<EmailSyncContext> {
    const threads = await listThreadsWithOutbound();
    const knownIds = await collectAllKnownMessageIds();
    const threadIdsWithOutbound = new Set(threads.map((t) => t.id));

    return {
        threads,
        knownIds,
        participantEmails: await collectAllParticipantEmails(),
        threadIdsWithOutbound,
        scopeBudgetKey: null,
    };
}

export function resolveSinceDate(threads: BudgetEmailThreadRow[]): Date {
    const maxSync = threads
        .map((t) => t.last_synced_at)
        .filter(Boolean)
        .map((s) => new Date(s!).getTime())
        .reduce((a, b) => Math.max(a, b), 0);

    const floor = Date.now() - 14 * 24 * 60 * 60 * 1000;
    if (maxSync > 0) {
        return new Date(Math.max(maxSync - 2 * 24 * 60 * 60 * 1000, floor));
    }
    return new Date(floor);
}

export function envelopeMightMatch(
    ctx: EmailSyncContext,
    fromAddr: string,
    subject: string
): boolean {
    if (/\[PZ:/i.test(subject)) return true;

    if (!fromAddr) return false;
    if (!ctx.participantEmails.has(fromAddr)) return false;

    if (/^re:\s*/i.test(subject.trim())) return true;
    return ctx.threadIdsWithOutbound.size > 0;
}
