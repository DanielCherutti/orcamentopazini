"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Table } from "surrealdb";

import { ensurePlatformAuditSchema } from "@/actions/platform-admin-actions";
import { resolveTenantRef } from "@/actions/platform-helpers";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import type { ImpersonationPayload } from "@/lib/session-token";
import {
    assertPlatformMasterSession,
    getSessionContext,
    setPlatformMasterSession,
    setSessionContext,
} from "@/lib/tenant-context";

const SESSION_MAX_AGE = 60 * 60 * 8;
const IMPERSONATION_TTLS = [30, 60, 120] as const;

export type ImpersonationAuditItem = {
    id: string;
    action: string;
    actor_email: string;
    tenant_id: string;
    tenant_slug: string;
    reason?: string;
    mode?: string;
    created_at: string;
    ended_at?: string | null;
};

export async function startImpersonationAction(input: {
    tenantRef: string;
    reason: string;
    mode: "readonly" | "full";
    ttlMinutes?: number;
}): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const reason = input.reason.trim();
    if (reason.length < 10) {
        return { success: false, error: "Informe o motivo (mínimo 10 caracteres)" };
    }

    const ttl = IMPERSONATION_TTLS.includes(
        input.ttlMinutes as (typeof IMPERSONATION_TTLS)[number],
    )
        ? input.ttlMinutes!
        : 60;

    const db = await getDb();
    try {
        await ensurePlatformAuditSchema();
        const rid = await resolveTenantRef(db, input.tenantRef);
        const canonicalId = recordIdToString(rid)!;
        const raw = await db.select<Record<string, unknown>>(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Organização não encontrada" };

        const slug = String(row.slug ?? "");
        const startedAt = new Date();
        const expiresAt = new Date(startedAt.getTime() + ttl * 60 * 1000);

        const audit = await db.create(new Table("platform_audit_log")).content({
            action: "impersonation_start",
            actor_email: auth.ctx.email,
            tenant_id: canonicalId,
            tenant_slug: slug,
            reason,
            mode: input.mode,
            created_at: startedAt.toISOString(),
        });
        const auditRow = Array.isArray(audit) ? audit[0] : audit;
        const auditId = recordIdToString((auditRow as { id: unknown }).id) ?? "";

        const impersonation: ImpersonationPayload = {
            tenantId: canonicalId,
            tenantSlug: slug,
            mode: input.mode,
            reason,
            startedAt: startedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            auditId,
        };

        await setSessionContext(
            {
                email: auth.ctx.email,
                tenantId: canonicalId,
                role: "admin",
                pending: false,
                platformMode: false,
                impersonation,
            },
            SESSION_MAX_AGE,
        );

        revalidatePath("/platform");
        return { success: true };
    } catch (error) {
        console.error("startImpersonationAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao iniciar modo suporte" };
    }
}

export async function startImpersonationAndRedirectAction(input: {
    tenantRef: string;
    reason: string;
    mode: "readonly" | "full";
    ttlMinutes?: number;
}) {
    const res = await startImpersonationAction(input);
    if (!res.success) {
        redirect(`/platform/organizations/${encodeURIComponent(input.tenantRef)}?error=impersonation`);
    }
    redirect("/dashboard");
}

export async function endImpersonationAction(): Promise<{ success: boolean; error?: string }> {
    const ctx = await getSessionContext();
    if (!ctx?.impersonation) {
        return { success: false, error: "Não está em modo suporte" };
    }

    const db = await getDb();
    try {
        if (ctx.impersonation.auditId) {
            await ensurePlatformAuditSchema();
            await db
                .update(requireRecordId("platform_audit_log", ctx.impersonation.auditId))
                .merge({
                    action: "impersonation_end",
                    ended_at: new Date().toISOString(),
                });
        }
    } catch (error) {
        console.error("endImpersonationAction audit:", error);
    }

    await setPlatformMasterSession(ctx.email);
    revalidatePath("/platform");
    return { success: true };
}

export async function endImpersonationAndRedirectAction() {
    await endImpersonationAction();
    redirect("/platform");
}

export async function listImpersonationAuditAction(tenantRef: string): Promise<{
    success: boolean;
    data?: ImpersonationAuditItem[];
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensurePlatformAuditSchema();
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        const rows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM platform_audit_log
             WHERE tenant_id = $tenantId AND action INSIDE ['impersonation_start', 'impersonation_end', 'impersonation_expired']
             ORDER BY created_at DESC LIMIT 50`,
            { tenantId },
        );

        const data = (rows[0] ?? []).map((row) => ({
            id: recordIdToString(row.id) ?? "",
            action: String(row.action ?? ""),
            actor_email: String(row.actor_email ?? ""),
            tenant_id: String(row.tenant_id ?? ""),
            tenant_slug: String(row.tenant_slug ?? ""),
            reason: row.reason != null ? String(row.reason) : undefined,
            mode: row.mode != null ? String(row.mode) : undefined,
            created_at: String(row.created_at ?? ""),
            ended_at: row.ended_at != null ? String(row.ended_at) : null,
        }));

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listImpersonationAuditAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar auditoria" };
    }
}
