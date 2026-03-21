/**
 * Sessão assinada (HMAC-SHA256) para cookie httpOnly.
 * Usa apenas Web Crypto API — compatível com Node e Edge (proxy/middleware).
 */

const encoder = new TextEncoder();

function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
    const b64 = btoa(binary);
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(s: string): Uint8Array {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const binary = atob(b64 + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"],
    );
}

export async function signSessionToken(
    sub: string,
    secret: string,
    maxAgeSec: number,
): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
    const payload = encoder.encode(JSON.stringify({ v: 1, sub, exp }));
    const key = await importHmacKey(secret);
    const signature = await crypto.subtle.sign("HMAC", key, payload);
    const sigB64 = bytesToBase64Url(new Uint8Array(signature));
    const payloadB64 = bytesToBase64Url(payload);
    return `${payloadB64}.${sigB64}`;
}

/** Retorna o e-mail do subject se o token for válido e não expirado; senão null. */
export async function verifySessionToken(
    token: string,
    secret: string,
): Promise<string | null> {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    if (!payloadB64 || !sigB64) return null;

    let payload: Uint8Array;
    let sig: Uint8Array;
    try {
        payload = base64UrlToBytes(payloadB64);
        sig = base64UrlToBytes(sigB64);
    } catch {
        return null;
    }

    const key = await importHmacKey(secret);
    const ok = await crypto.subtle.verify(
        "HMAC",
        key,
        new Uint8Array(sig),
        new Uint8Array(payload),
    );
    if (!ok) return null;

    let data: { v?: number; sub?: string; exp?: number };
    try {
        data = JSON.parse(new TextDecoder().decode(payload)) as {
            v?: number;
            sub?: string;
            exp?: number;
        };
    } catch {
        return null;
    }

    if (data.v !== 1 || typeof data.sub !== "string" || typeof data.exp !== "number") {
        return null;
    }
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return data.sub;
}
