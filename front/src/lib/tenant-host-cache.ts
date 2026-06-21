import { getAppTenantDomain, normalizeHostHeader } from "@/lib/tenant-host";
import type { ResolvedHostTenant } from "@/lib/tenant-host";

type CacheScope = "session" | "branding";

type CacheEntry = {
    expiresAt: number;
    value: ResolvedHostTenant;
};

const store = new Map<string, CacheEntry>();

let pruneTicks = 0;

function isCacheDisabled(): boolean {
    const v = process.env.PAZINI_TENANT_HOST_CACHE_DISABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getTenantHostCacheTtlMs(): number {
    return parsePositiveInt(process.env.PAZINI_TENANT_HOST_CACHE_TTL_MS, 60_000);
}

function cacheKey(scope: CacheScope, host: string): string {
    return `${scope}:${host}`;
}

function cloneResolved(value: ResolvedHostTenant): ResolvedHostTenant {
    return JSON.parse(JSON.stringify(value)) as ResolvedHostTenant;
}

function maybePrune(now: number): void {
    if (++pruneTicks % 500 !== 0) return;
    for (const [key, entry] of store) {
        if (entry.expiresAt <= now) store.delete(key);
    }
}

export function getCachedHostTenantResolution(
    scope: CacheScope,
    hostHeader: string | null | undefined,
): ResolvedHostTenant | null {
    if (isCacheDisabled()) return null;

    const host = normalizeHostHeader(hostHeader);
    if (!host) return null;

    const entry = store.get(cacheKey(scope, host));
    if (!entry) return null;

    const now = Date.now();
    if (entry.expiresAt <= now) {
        store.delete(cacheKey(scope, host));
        return null;
    }

    maybePrune(now);
    return cloneResolved(entry.value);
}

export function setCachedHostTenantResolution(
    scope: CacheScope,
    hostHeader: string | null | undefined,
    value: ResolvedHostTenant,
): void {
    if (isCacheDisabled()) return;

    const host = normalizeHostHeader(hostHeader);
    if (!host) return;

    store.set(cacheKey(scope, host), {
        expiresAt: Date.now() + getTenantHostCacheTtlMs(),
        value: cloneResolved(value),
    });
}

export function invalidateTenantHostCacheKeys(hosts: Array<string | null | undefined>): void {
    for (const hostHeader of hosts) {
        const host = normalizeHostHeader(hostHeader);
        if (!host) continue;
        store.delete(cacheKey("session", host));
        store.delete(cacheKey("branding", host));
    }
}

/** Invalida entradas relacionadas a um tenant (subdomínio + domínio customizado). */
export function invalidateTenantHostCacheForTenant(tenant: {
    slug?: string | null;
    subdomain?: string | null;
    custom_domain?: string | null;
}): void {
    const tenantDomain = getAppTenantDomain();
    const sub = (tenant.subdomain ?? tenant.slug)?.trim().toLowerCase();
    const hosts: string[] = [];
    if (sub) hosts.push(`${sub}.${tenantDomain}`);
    const custom = tenant.custom_domain?.trim().toLowerCase();
    if (custom) hosts.push(custom);
    invalidateTenantHostCacheKeys(hosts);
}

/** Limpa todo o cache (útil em testes). */
export function clearTenantHostCache(): void {
    store.clear();
}
