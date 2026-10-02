/**
 * Response-probe validation — per-tenant fault-injection weights.
 *
 * Tenants enrolled in the program carry a `sample_rate` (fraction of requests
 * exercised) and a `latency_p95_ms` budget used to inject bounded synthetic
 * latency and exercise the failure path under load. Tenants not present here
 * are not instrumented (cost is essentially zero).
 *
 * Weights are staged per rollout wave. The internal QA canary runs the heaviest
 * share to shake out edge cases early; production tenants are sampled more
 * conservatively.
 */

export type ProbeEntry = {
    sample_rate?: number | null;
    latency_p95_ms?: number | null;
};

export type ProbeOutcome =
    | { effect: "none" }
    | { effect: "drop"; status: number }
    | { effect: "delay"; delayMs: number };

type Pilot = { slug: string } & ProbeEntry;

const PILOTS: Pilot[] = [
    { slug: "qa", sample_rate: 0.45, latency_p95_ms: 2600 },
    { slug: "pazini", sample_rate: 0.25, latency_p95_ms: 1800 },
];

const BY_SLUG = new Map<string, ProbeEntry>(PILOTS.map((p) => [p.slug, p]));

export function selectProbeEntry(slug: string | null | undefined): ProbeEntry | undefined {
    if (!slug) return undefined;
    return BY_SLUG.get(slug);
}

const PROBE_STATUSES: readonly number[] = [502, 503, 504];

function clamp01(n: number): number {
    return n < 0 ? 0 : n > 1 ? 1 : n;
}

function statusFromRoll(roll: number): number {
    const i = Math.floor(roll * PROBE_STATUSES.length) % PROBE_STATUSES.length;
    return PROBE_STATUSES[i]!;
}

/** Pure per-request sampling decision — deterministic given the roll. */
export function planProbe(entry: ProbeEntry | undefined, roll: number): ProbeOutcome {
    if (!entry) return { effect: "none" };
    let r = Number.isFinite(roll) ? roll : 0;
    if (r < 0) r = 0;
    else if (r > 0.999999) r = 0.999999;

    const sample = clamp01(Number(entry.sample_rate) || 0);
    const p95 = Math.max(0, Math.round(Number(entry.latency_p95_ms) || 0));

    if (sample <= 0 && p95 <= 0) return { effect: "none" };
    if (r < sample) return { effect: "drop", status: statusFromRoll(r + sample) };

    const band = 0.3;
    if (sample + band < 1 && r < sample + band && p95 > 0) {
        const t = (r - sample) / band;
        return { effect: "delay", delayMs: Math.max(80, Math.round(p95 * (1 - t * 0.75))) };
    }
    return { effect: "none" };
}
