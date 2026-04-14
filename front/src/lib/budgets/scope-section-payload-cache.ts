import type { BudgetImage, BudgetItem } from "@/types/budget-types";
import { getScopeSectionOpenPayloadAction } from "@/actions/scope-section-payload-actions";

type Payload = { items: BudgetItem[]; images: BudgetImage[] };

const store = new Map<string, Payload>();

export function scopeSectionPayloadCacheKey(scopeDataVersion: number, sectionId: string): string {
    /* Prefixo versiona entradas antigas (payload vazio/errado após mudanças de agrupamento). */
    return `scope-payload-v4::${scopeDataVersion}::${sectionId}`;
}

export function readScopeSectionPayloadFromCache(
    scopeDataVersion: number,
    sectionId: string
): Payload | undefined {
    return store.get(scopeSectionPayloadCacheKey(scopeDataVersion, sectionId));
}

export function writeScopeSectionPayloadCache(
    scopeDataVersion: number,
    sectionId: string,
    data: Payload
): void {
    store.set(scopeSectionPayloadCacheKey(scopeDataVersion, sectionId), data);
}

export async function loadScopeSectionPayloadCached(
    scopeDataVersion: number,
    sectionId: string,
    options?: { skipRead?: boolean; skipWrite?: boolean }
): Promise<{
    success: boolean;
    data?: Payload;
    error?: string;
    fromCache?: boolean;
}> {
    const key = scopeSectionPayloadCacheKey(scopeDataVersion, sectionId);
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
    scopeDataVersion: number,
    sectionId: string,
    delayMs = 160
): void {
    const key = scopeSectionPayloadCacheKey(scopeDataVersion, sectionId);
    if (store.has(key)) return;

    const prev = prefetchTimers.get(key);
    if (prev) clearTimeout(prev);

    prefetchTimers.set(
        key,
        setTimeout(() => {
            prefetchTimers.delete(key);
            void loadScopeSectionPayloadCached(scopeDataVersion, sectionId);
        }, delayMs)
    );
}
