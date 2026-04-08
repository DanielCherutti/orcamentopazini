/**
 * Leitura leve para orçamentos muito grandes (feature flag por env).
 * `BUDGET_LARGE_SCOPE_ITEM_THRESHOLD` — número mínimo de itens no escopo para ativar shell + queries parciais.
 * Se não definido, o comportamento permanece o legado (grafo completo onde ainda for usado).
 */
export function parseBudgetLargeScopeItemThreshold(): number | undefined {
    const raw = process.env.BUDGET_LARGE_SCOPE_ITEM_THRESHOLD;
    if (raw == null || String(raw).trim() === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined;
}

export function shouldUseLightBudgetRead(itemCount: number): boolean {
    const t = parseBudgetLargeScopeItemThreshold();
    if (t === undefined) return false;
    return itemCount >= t;
}
