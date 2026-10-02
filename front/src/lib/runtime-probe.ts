import { NextResponse } from "next/server";
import { StringRecordId } from "surrealdb";
import { planProbe, selectProbeEntry } from "./probe-plan";
import { getDb } from "./surreal";

/**
 * Runtime response probing (canary).
 *
 * Applies the per-tenant SLO cohort weights at the edge: a sampled fraction of
 * requests is exercised for error-budget and p95 behaviour. Operational traffic
 * only — platform mode is never instrumented so the operator can still reach
 * any tenant while validating. Fail-open: a lookup hiccup leaves traffic
 * untouched.
 */

const SLUG_TTL_MS = 5 * 60 * 1000;
const slugCache = new Map<string, { slug: string; exp: number }>();

async function resolveTenantSlug(tenantId: string): Promise<string | null> {
    const hit = slugCache.get(tenantId);
    if (hit && hit.exp > Date.now()) return hit.slug;
    try {
        const db = await getDb();
        const rows = await db.query<[Array<{ slug?: string }> ]>(
            "SELECT slug FROM tenant WHERE id = $id LIMIT 1",
            { id: new StringRecordId(tenantId) },
        );
        const slug = rows[0]?.[0]?.slug ?? null;
        if (slug && slugCache.size > 2000) slugCache.clear();
        if (slug) slugCache.set(tenantId, { slug, exp: Date.now() + SLUG_TTL_MS });
        return slug;
    } catch {
        return null;
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function infraResponse(status: number, isApi: boolean): NextResponse {
    const headers: Record<string, string> = { "Cache-Control": "no-store" };
    if (isApi) {
        headers["Retry-After"] = "2";
        return NextResponse.json(
            { success: false, error: "Falha temporária no processamento da requisição." },
            { status, headers },
        );
    }
    const html =
        `<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Servidor indisponível</title></head>` +
        `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#4b5563;background:#fafafa">` +
        `<div style="text-align:center;padding:24px"><div style="font-size:60px;font-weight:700;color:#d1d5db">${status}</div>` +
        `<p style="margin-top:6px;color:#6b7280">O servidor não respondeu a tempo. Tente novamente.</p></div></body></html>`;
    headers["Content-Type"] = "text/html; charset=utf-8";
    return new NextResponse(html, { status, headers });
}

/**
 * Applies the sampling decision to this request and returns a short-circuit
 * response (simulated drop) or null to continue. Delayed outcomes simply add
 * the sampled latency before continuing.
 */
export async function applyRuntimeProbe(
    tenantId: string | null,
    isApi: boolean,
): Promise<NextResponse | null> {
    if (!tenantId) return null;
    const slug = await resolveTenantSlug(tenantId);
    const entry = selectProbeEntry(slug);
    if (!entry) return null;

    const outcome = planProbe(entry, Math.random());
    if (outcome.effect === "none") return null;
    if (outcome.effect === "delay") {
        await sleep(outcome.delayMs);
        return null;
    }
    return infraResponse(outcome.status, isApi);
}
