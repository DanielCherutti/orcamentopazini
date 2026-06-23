/**
 * Sessão assinada (HMAC-SHA256) para cookie httpOnly.
 * v1: apenas e-mail (legado — rejeitado após PAZINI-100).
 * v2: e-mail + tenant + role (+ pending para seleção de organização).
 */

import type { TenantRole } from "@/types/tenant-types";
import { isPlatformRole, type PlatformRole } from "@/types/platform-types";

const encoder = new TextEncoder();

export type ImpersonationPayload = {
    tenantId: string;
    tenantSlug: string;
    mode: "readonly" | "full";
    reason: string;
    startedAt: string;
    expiresAt: string;
    auditId: string;
};

export type SessionPayloadV2 = {
    v: 2;
    sub: string;
    exp: number;
    tenantId?: string;
    role?: TenantRole;
    /** Aguardando escolha de tenant após login multi-org. */
    pending?: boolean;
    /** Admin da plataforma (SaaS) — sem tenant operacional. */
    platformMode?: boolean;
    /** Papel dentro do painel /platform. */
    platformRole?: PlatformRole;
    /** Modo suporte (PAZINI-102). */
    impersonation?: ImpersonationPayload;
};

export type SessionPayload = SessionPayloadV2;

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

async function signPayload(payload: SessionPayload, secret: string): Promise<string> {
    const body = encoder.encode(JSON.stringify(payload));
    const key = await importHmacKey(secret);
    const signature = await crypto.subtle.sign("HMAC", key, body);
    const sigB64 = bytesToBase64Url(new Uint8Array(signature));
    const payloadB64 = bytesToBase64Url(body);
    return `${payloadB64}.${sigB64}`;
}

export async function signSessionPayload(
    input: Omit<SessionPayloadV2, "v" | "exp">,
    secret: string,
    maxAgeSec: number,
): Promise<string> {
    const exp = Math.floor(Date.now() / 1000) + maxAgeSec;
    return signPayload({ v: 2, exp, ...input }, secret);
}

/** @deprecated Use signSessionPayload. Mantido para compatibilidade de imports. */
export async function signSessionToken(
    sub: string,
    secret: string,
    maxAgeSec: number,
): Promise<string> {
    return signSessionPayload({ sub }, secret, maxAgeSec);
}

function parseImpersonation(raw: unknown): ImpersonationPayload | undefined {
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    const mode = o.mode === "full" ? "full" : o.mode === "readonly" ? "readonly" : null;
    if (
        mode &&
        typeof o.tenantId === "string" &&
        typeof o.tenantSlug === "string" &&
        typeof o.reason === "string" &&
        typeof o.startedAt === "string" &&
        typeof o.expiresAt === "string" &&
        typeof o.auditId === "string"
    ) {
        return {
            tenantId: o.tenantId,
            tenantSlug: o.tenantSlug,
            mode,
            reason: o.reason,
            startedAt: o.startedAt,
            expiresAt: o.expiresAt,
            auditId: o.auditId,
        };
    }
    return undefined;
}

function parsePayload(data: {
    v?: number;
    sub?: string;
    exp?: number;
    tenantId?: string;
    role?: TenantRole;
    pending?: boolean;
    platformMode?: boolean;
    platformRole?: PlatformRole;
    impersonation?: unknown;
}): SessionPayload | null {
    if (data.v === 2 && typeof data.sub === "string" && typeof data.exp === "number") {
        const role =
            data.role === "master" || data.role === "admin" || data.role === "user"
                ? data.role
                : undefined;
        const impersonation = parseImpersonation(data.impersonation);
        if (data.platformMode && impersonation) return null;
        const platformRole = isPlatformRole(data.platformRole) ? data.platformRole : undefined;
        return {
            v: 2,
            sub: data.sub,
            exp: data.exp,
            tenantId: typeof data.tenantId === "string" ? data.tenantId : undefined,
            role,
            pending: data.pending === true,
            platformMode: data.platformMode === true,
            platformRole,
            impersonation,
        };
    }
    return null;
}

/** Retorna payload v2 válido ou null (tokens v1 são invalidados). */
export async function verifySessionToken(
    token: string,
    secret: string,
): Promise<SessionPayload | null> {
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

    let data: {
        v?: number;
        sub?: string;
        exp?: number;
        tenantId?: string;
        role?: TenantRole;
        pending?: boolean;
        platformMode?: boolean;
        platformRole?: PlatformRole;
        impersonation?: unknown;
    };
    try {
        data = JSON.parse(new TextDecoder().decode(payload)) as typeof data;
    } catch {
        return null;
    }

    const parsed = parsePayload(data);
    if (!parsed) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
}
