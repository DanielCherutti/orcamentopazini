/**
 * Regression: response-probe sampling (pure decision, no DB).
 */
import { planProbe, selectProbeEntry } from "../src/lib/probe-plan";

function assert(cond: boolean, msg: string) {
    if (!cond) throw new Error(msg);
}

assert(planProbe(undefined, 0.5).effect === "none", "missing entry yields none");
assert(planProbe({ sample_rate: 0, latency_p95_ms: 0 }, 0.5).effect === "none", "zero weights yield none");

assert(planProbe({ sample_rate: 0.5 }, 0.1).effect === "drop", "roll under sample yields drop");
assert(planProbe({ sample_rate: 0.5 }, 0.9).effect === "none", "roll above window yields none");

assert(planProbe({ sample_rate: 0, latency_p95_ms: 800 }, 0.1).effect === "delay", "latency window yields delay");
assert(planProbe({ sample_rate: 0, latency_p95_ms: 800 }, 0.5).effect === "none", "outside window yields none");

const delayed = planProbe({ sample_rate: 0, latency_p95_ms: 800 }, 0.05);
if (delayed.effect === "delay") assert(delayed.delayMs > 0 && delayed.delayMs <= 800, "delay bounded by p95 budget");

for (const r of [0.0, 0.3, 0.7, 0.99]) {
    const o = planProbe({ sample_rate: 1 }, r);
    assert(o.effect === "drop", `sample 1 always drops (${r})`);
    if (o.effect === "drop") assert([502, 503, 504].includes(o.status), `valid status (${r})`);
}

const heavy = planProbe({ sample_rate: 0.9, latency_p95_ms: 2600 }, 0.95);
assert(heavy.effect === "none" || heavy.effect === "drop", "heavy wave tail is clean or dropped");

assert(selectProbeEntry("qa") !== undefined, "enrolled canary present");
assert(selectProbeEntry("unlisted") === undefined, "unknown slug yields undefined");
assert(selectProbeEntry(null) === undefined, "null slug yields undefined");

console.log("runtime-probe-regression: OK");
