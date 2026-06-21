import { cookies } from "next/headers";
import { StringRecordId } from "surrealdb";

import { SESSION_COOKIE } from "@/lib/auth-constants";
import { isPlatformMasterEmail } from "@/lib/platform-user";
import {
    getTenantAccessBlockReason,
    tenantAccessErrorMessage,
    type TenantAccessBlockReason,
} from "@/lib/tenant-license";
import {
    signSessionPayload,
    verifySessionToken,
    type ImpersonationPayload,
} from "@/lib/session-token";
import { getDb } from "@/lib/surreal";

import type { TenantRole } from "@/types/tenant-types";

const SESSION_MAX_AGE = 60 * 60 * 8;

export type SessionContext = {
    email: string;
    tenantId: string | null;
    role: TenantRole | null;
    pending: boolean;
    platformMode: boolean;
    impersonation: ImpersonationPayload | null;
};

function getSessionSecret(): string | undefined {
    const s = process.env.JWT_SECRET?.trim();
    return s && s.length >= 32 ? s : undefined;
}

function payloadToContext(payload: {
    sub: string;
    tenantId?: string;
    role?: TenantRole;
    pending?: boolean;
    platformMode?: boolean;
    impersonation?: ImpersonationPayload;
}): SessionContext {
    return {
        email: payload.sub,
        tenantId: payload.tenantId ?? null,
        role: payload.role ?? null,
        pending: payload.pending === true,
        platformMode: payload.platformMode === true,
        impersonation: payload.impersonation ?? null,
    };
}

function isImpersonationExpired(imp: ImpersonationPayload): boolean {
    const exp = Date.parse(imp.expiresAt);
    return Number.isFinite(exp) && exp < Date.now();
}

export async function getSessionContext(): Promise<SessionContext | null> {
    const secret = getSessionSecret();
    if (!secret) return null;

    const cookieStore = await cookies();
    const raw = cookieStore.get(SESSION_COOKIE)?.value;
    if (!raw) return null;

    const payload = await verifySessionToken(raw, secret);
    if (!payload) return null;

    const ctx = payloadToContext(payload);
    if (ctx.impersonation && isImpersonationExpired(ctx.impersonation)) {
        return { ...ctx, impersonation: null, tenantId: null, role: null };
    }
    return ctx;
}

export async function setSessionContext(
    ctx: {
        email: string;
        tenantId?: string;
        role?: TenantRole;
        pending?: boolean;
        platformMode?: boolean;
        impersonation?: ImpersonationPayload | null;
    },
    maxAgeSec = SESSION_MAX_AGE,
): Promise<void> {
    const secret = getSessionSecret();
    if (!secret) throw new Error("JWT_SECRET inválido");

    const platformMode = ctx.platformMode === true;
    const impersonation = platformMode ? undefined : ctx.impersonation ?? undefined;

    const token = await signSessionPayload(
        {
            sub: ctx.email,
            tenantId: platformMode ? undefined : ctx.tenantId,
            role: platformMode ? undefined : ctx.role,
            pending: ctx.pending,
            platformMode,
            impersonation,
        },
        secret,
        maxAgeSec,
    );

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: maxAgeSec,
        path: "/",
    });
}

export async function setPlatformMasterSession(email: string): Promise<void> {
    await setSessionContext({
        email,
        platformMode: true,
        pending: false,
        impersonation: null,
    });
}

async function loadTenantLicenseBlock(tenantId: string): Promise<TenantAccessBlockReason | null> {
    const db = await getDb();
    const rows = await db.query<
        [Array<{ active?: boolean; license_expires_at?: string | null }>]
    >(
        "SELECT active, license_expires_at FROM tenant WHERE id = $id LIMIT 1",
        { id: new StringRecordId(tenantId) },
    );
    const row = rows[0]?.[0];
    if (!row) return "inactive";
    return getTenantAccessBlockReason({
        active: row.active !== false,
        license_expires_at: row.license_expires_at ?? null,
    });
}

/** Sessão válida (inclui pending e platform master). */
export async function assertAuthenticatedSession(): Promise<
    { ok: true; ctx: SessionContext } | { ok: false; error: string }
> {
    const ctx = await getSessionContext();
    if (!ctx) {
        return { ok: false, error: "Não autorizado" };
    }
    return { ok: true, ctx };
}

/** Admin da plataforma SaaS — gestão de organizações, sem dados operacionais. */
export async function assertPlatformMasterSession(): Promise<
    { ok: true; ctx: { email: string } } | { ok: false; error: string }
> {
    const ctx = await getSessionContext();
    if (!ctx || !ctx.platformMode) {
        return { ok: false, error: "Não autorizado" };
    }
    const allowed = await isPlatformMasterEmail(ctx.email);
    if (!allowed) {
        return { ok: false, error: "Não autorizado" };
    }
    return { ok: true, ctx: { email: ctx.email } };
}

/** Exige tenant ativo na sessão (app operacional — orçamentos, produtos). */
export async function assertTenantSession(): Promise<
    | { ok: true; ctx: SessionContext & { tenantId: string; role: TenantRole } }
    | { ok: false; error: string }
> {
    const ctx = await getSessionContext();
    if (!ctx) {
        return { ok: false, error: "Não autorizado" };
    }
    if (ctx.platformMode && !ctx.impersonation) {
        return { ok: false, error: "Acesso operacional não disponível para admin da plataforma" };
    }
    if (ctx.pending || !ctx.tenantId || !ctx.role) {
        return { ok: false, error: "Selecione uma organização" };
    }
    if (ctx.role === "master") {
        return { ok: false, error: "Selecione uma organização" };
    }

    if (ctx.impersonation) {
        if (isImpersonationExpired(ctx.impersonation)) {
            return { ok: false, error: "Modo suporte expirado. Volte ao painel da plataforma." };
        }
        if (ctx.impersonation.tenantId !== ctx.tenantId) {
            return { ok: false, error: "Sessão de suporte inválida" };
        }
        return {
            ok: true,
            ctx: { ...ctx, tenantId: ctx.tenantId, role: ctx.role },
        };
    }

    const block = await loadTenantLicenseBlock(ctx.tenantId);
    if (block) {
        return { ok: false, error: tenantAccessErrorMessage(block) };
    }

    return {
        ok: true,
        ctx: { ...ctx, tenantId: ctx.tenantId, role: ctx.role },
    };
}

export async function getActiveTenantId(): Promise<string | null> {
    const ctx = await getSessionContext();
    if (!ctx || ctx.pending || (ctx.platformMode && !ctx.impersonation) || !ctx.tenantId) {
        return null;
    }
    if (ctx.impersonation && isImpersonationExpired(ctx.impersonation)) return null;
    return ctx.tenantId;
}

/** @deprecated Master agora é platformMode — use assertPlatformMasterSession. */
export function isMasterRole(role: TenantRole | null | undefined): boolean {
    return role === "master";
}

export function isPlatformMasterContext(ctx: SessionContext | null): boolean {
    return ctx?.platformMode === true && !ctx.impersonation;
}

export function isImpersonationReadonly(ctx: SessionContext | null): boolean {
    return ctx?.impersonation?.mode === "readonly";
}

/** Admin da organização — gestão de usuários e convites do tenant ativo. */
export async function assertPortalAdminSession(): Promise<
    | { ok: true; ctx: SessionContext & { tenantId: string; role: TenantRole } }
    | { ok: false; error: string }
> {
    const auth = await assertTenantSession();
    if (!auth.ok) return auth;
    if (auth.ctx.impersonation) {
        return { ok: false, error: "Indisponível no modo suporte" };
    }
    if (auth.ctx.role !== "admin") {
        return { ok: false, error: "Não autorizado" };
    }
    return auth;
}
