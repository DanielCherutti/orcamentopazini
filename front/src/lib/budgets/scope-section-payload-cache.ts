import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import { getScopeSectionOpenPayloadAction } from "@/actions/scope-section-payload-actions";

type Payload = { items: BudgetItem[]; images: BudgetImage[] };

const store = new Map<string, Payload>();

export function scopeSectionPayloadCacheKey(budgetId: string, sectionId: string): string {
    return `scope-payload-v5::${budgetId}::${sectionId}`;
}

export function readScopeSectionPayloadFromCache(
    budgetId: string,
    sectionId: string,
): Payload | undefined {
    return store.get(scopeSectionPayloadCacheKey(budgetId, sectionId));
}

export function writeScopeSectionPayloadCache(
    budgetId: string,
    sectionId: string,
    data: Payload,
): void {
    store.set(scopeSectionPayloadCacheKey(budgetId, sectionId), data);
}

export function invalidateScopeSectionPayloadCache(budgetId: string, sectionId: string): void {
    store.delete(scopeSectionPayloadCacheKey(budgetId, sectionId));
}

export function invalidateScopeSectionPayloadCacheForBudget(budgetId: string): void {
    const prefix = `scope-payload-v5::${budgetId}::`;
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

export async function loadScopeSectionPayloadCached(
    budgetId: string,
    sectionId: string,
    options?: { skipRead?: boolean; skipWrite?: boolean },
): Promise<{
    success: boolean;
    data?: Payload;
    error?: string;
    fromCache?: boolean;
}> {
    const key = scopeSectionPayloadCacheKey(budgetId, sectionId);
    if (!options?.skipRead) {
        const hit = store.get(key);
        if (hit) {
            return { success: true, data: hit, fromCache: true };
        }
    }

    const res = await getScopeSectionOpenPayloadAction(sectionId);
    if (!res.success || !res.data) {
        return { success: false, error: res.error };
    }

    const payload: Payload = {
        items: res.data.items as BudgetItem[],
        images: res.data.images as BudgetImage[],
    };
    if (!options?.skipWrite) {
        store.set(key, payload);
    }
    return { success: true, data: payload, fromCache: false };
}

const prefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Prefetch com debounce (hover na sidebar). */
export function prefetchScopeSectionPayloadDebounced(
    budgetId: string,
    sectionId: string,
    delayMs = 160,
): void {
    const key = scopeSectionPayloadCacheKey(budgetId, sectionId);
    if (store.has(key)) return;

    const prev = prefetchTimers.get(key);
    if (prev) clearTimeout(prev);

    prefetchTimers.set(
        key,
        setTimeout(() => {
            prefetchTimers.delete(key);
            void loadScopeSectionPayloadCached(budgetId, sectionId);
        }, delayMs),
    );
}
