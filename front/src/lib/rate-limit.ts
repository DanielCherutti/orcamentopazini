/**
 * Rate limiting em memória (janela fixa), por chave lógica.
 * Adequado a instância única ou dev; em múltiplas réplicas cada processo tem seu próprio contador
 * (mitigação parcial — para limite global usar Redis/upstream).
 *
 * Desligar em dev: PAZINI_RATE_LIMIT_DISABLED=true ou RATE_LIMIT_DISABLED=true
 */

type WindowState = { count: number; resetAt: number };

const store = new Map<string, WindowState>();

let pruneTicks = 0;

function isRateLimitDisabled(): boolean {
    const v =
        process.env.PAZINI_RATE_LIMIT_DISABLED?.trim().toLowerCase() ||
        process.env.RATE_LIMIT_DISABLED?.trim().toLowerCase();
    return v === "true" || v === "1" || v === "yes";
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
    if (raw == null || raw === "") return fallback;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

function maybePrune(now: number): void {
    if (++pruneTicks % 400 !== 0) return;
    const cutoff = now - 120_000;
    for (const [key, state] of store) {
        if (state.resetAt < cutoff) store.delete(key);
    }
}

/**
 * Consome 1 tentativa na janela. Retorna se ainda há cota.
 */
export function rateLimitConsume(
    key: string,
    max: number,
    windowMs: number,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
    if (isRateLimitDisabled()) {
        return { ok: true };
    }

    const now = Date.now();
    maybePrune(now);

    let state = store.get(key);
    if (!state || now >= state.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { ok: true };
    }

    state.count += 1;
    if (state.count > max) {
        const retryAfterSeconds = Math.max(
            1,
            Math.ceil((state.resetAt - now) / 1000),
        );
        return { ok: false, retryAfterSeconds };
    }

    return { ok: true };
}

export function getClientIpFromHeaders(h: Headers): string {
    const xff = h.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first.slice(0, 128);
    }
    const realIp = h.get("x-real-ip")?.trim();
    if (realIp) return realIp.slice(0, 128);
    return "unknown";
}

/** Limites de login (força bruta): tentativas por IP por janela. */
export function getLoginRateLimitConfig(): { max: number; windowMs: number } {
    return {
        max: parsePositiveInt(process.env.PAZINI_RATE_LIMIT_LOGIN_MAX, 20),
        windowMs: parsePositiveInt(
            process.env.PAZINI_RATE_LIMIT_LOGIN_WINDOW_MS,
            15 * 60 * 1000,
        ),
    };
}

/** Limite geral para rotas /api (por IP). */
export function getApiRateLimitConfig(): { max: number; windowMs: number } {
    return {
        max: parsePositiveInt(process.env.PAZINI_RATE_LIMIT_API_MAX, 240),
        windowMs: parsePositiveInt(
            process.env.PAZINI_RATE_LIMIT_API_WINDOW_MS,
            60 * 1000,
        ),
    };
}

/** POST em /api/upload/* (por IP). */
export function getUploadPostRateLimitConfig(): {
    max: number;
    windowMs: number;
} {
    return {
        max: parsePositiveInt(process.env.PAZINI_RATE_LIMIT_UPLOAD_MAX, 40),
        windowMs: parsePositiveInt(
            process.env.PAZINI_RATE_LIMIT_UPLOAD_WINDOW_MS,
            60 * 1000,
        ),
    };
}

/** Novas conexões SSE compositor live (por IP). */
export function getSseLiveRateLimitConfig(): { max: number; windowMs: number } {
    return {
        max: parsePositiveInt(process.env.PAZINI_RATE_LIMIT_SSE_MAX, 25),
        windowMs: parsePositiveInt(
            process.env.PAZINI_RATE_LIMIT_SSE_WINDOW_MS,
            60 * 1000,
        ),
    };
}

export function checkLoginRateLimitFromHeaders(
    h: Headers,
): { ok: true } | { ok: false; retryAfterSeconds: number } {
    const ip = getClientIpFromHeaders(h);
    const { max, windowMs } = getLoginRateLimitConfig();
    const r = rateLimitConsume(`login:${ip}`, max, windowMs);
    if (!r.ok) return { ok: false, retryAfterSeconds: r.retryAfterSeconds };
    return { ok: true };
}
