import { Table } from "surrealdb";
import { getSessionContext } from "@/lib/tenant-context";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { ensureBillingAuditSchema } from "@/lib/billing-audit-schema";
import type { AuditActorKind, AuditScope } from "@/types/audit-types";

const SENSITIVE_KEYS = new Set([
    "password",
    "password_hash",
    "passwordConfirm",
    "smtp_pass",
    "invite_token",
    "token",
    "secret",
    "api_key",
]);

export type RecordAuditInput = {
    scope: AuditScope;
    action: string;
    resourceType: string;
    summary: string;
    tenantId?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    actorEmail?: string;
    actorKind?: AuditActorKind;
    ip?: string | null;
};

function sanitizeMetadata(meta?: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!meta || typeof meta !== "object") return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
        const lower = key.toLowerCase();
        if (SENSITIVE_KEYS.has(lower) || lower.includes("password") || lower.includes("token")) {
            continue;
        }
        if (value != null && typeof value === "object" && !Array.isArray(value)) {
            out[key] = sanitizeMetadata(value as Record<string, unknown>) ?? "[object]";
        } else {
            out[key] = value;
        }
    }
    return Object.keys(out).length > 0 ? out : null;
}

export async function resolveAuditActor(): Promise<{
    actorEmail: string;
    actorKind: AuditActorKind;
    tenantId: string | null;
}> {
    const ctx = await getSessionContext();
    if (!ctx?.email) {
        return { actorEmail: "system", actorKind: "system", tenantId: null };
    }
    if (ctx.impersonation) {
        return {
            actorEmail: ctx.email,
            actorKind: "impersonation",
            tenantId: ctx.impersonation.tenantId,
        };
    }
    if (ctx.platformMode) {
        return { actorEmail: ctx.email, actorKind: "platform", tenantId: null };
    }
    return {
        actorEmail: ctx.email,
        actorKind: "org",
        tenantId: ctx.tenantId,
    };
}

export async function recordAudit(input: RecordAuditInput): Promise<void> {
    try {
        await ensureBillingAuditSchema();
        const actor = await resolveAuditActor();
        const db = await getDb();
        const tenantId =
            input.tenantId !== undefined
                ? input.tenantId
                : input.scope === "tenant"
                  ? actor.tenantId
                  : null;

        await db.create(new Table("audit_log")).content({
            scope: input.scope,
            tenant_id: tenantId,
            actor_email: input.actorEmail ?? actor.actorEmail,
            actor_kind: input.actorKind ?? actor.actorKind,
            action: input.action,
            resource_type: input.resourceType,
            resource_id: input.resourceId ?? null,
            summary: input.summary.slice(0, 500),
            metadata: sanitizeMetadata(input.metadata),
            ip: input.ip ?? null,
            created_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error("recordAudit:", input.action, error);
        if (isTokenExpiredError(error)) resetDb();
    }
}

export async function auditTenantAction(
    input: Omit<RecordAuditInput, "scope"> & { tenantId?: string },
): Promise<void> {
    await recordAudit({ ...input, scope: "tenant" });
}

export async function auditPlatformAction(
    input: Omit<RecordAuditInput, "scope">,
): Promise<void> {
    await recordAudit({ ...input, scope: "platform" });
}
