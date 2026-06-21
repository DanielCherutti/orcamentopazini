"use server";

import { ensureBillingAuditSchema, migratePlatformAuditLogToAuditLog } from "@/lib/billing-audit-schema";
import { assertPlatformSession, assertPortalAdminSession } from "@/lib/tenant-context";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";
import type { AuditListFilters, AuditLogEntry } from "@/types/audit-types";

function serializeAuditRow(row: Record<string, unknown>): AuditLogEntry {
    return {
        id: recordIdToString(row.id) ?? "",
        scope: row.scope === "platform" ? "platform" : "tenant",
        tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
        actor_email: String(row.actor_email ?? ""),
        actor_kind:
            row.actor_kind === "platform" ||
            row.actor_kind === "org" ||
            row.actor_kind === "system" ||
            row.actor_kind === "impersonation"
                ? row.actor_kind
                : "org",
        action: String(row.action ?? ""),
        resource_type: String(row.resource_type ?? ""),
        resource_id: row.resource_id != null ? String(row.resource_id) : null,
        summary: String(row.summary ?? ""),
        metadata: (row.metadata as Record<string, unknown>) ?? null,
        ip: row.ip != null ? String(row.ip) : null,
        created_at: String(row.created_at ?? ""),
    };
}

export async function ensureAuditReadyAction(): Promise<void> {
    await ensureBillingAuditSchema();
    await migratePlatformAuditLogToAuditLog();
}

function buildAuditWhere(filters: AuditListFilters): {
    clause: string;
    params: Record<string, unknown>;
} {
    const parts: string[] = [];
    const params: Record<string, unknown> = {
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
    };

    if (filters.tenantId) {
        parts.push("tenant_id = $tenantId");
        params.tenantId = filters.tenantId;
    }
    if (filters.scope) {
        parts.push("scope = $scope");
        params.scope = filters.scope;
    }
    if (filters.actorEmail?.trim()) {
        parts.push("string::lowercase(actor_email) CONTAINS string::lowercase($actorEmail)");
        params.actorEmail = filters.actorEmail.trim();
    }
    if (filters.action?.trim()) {
        parts.push("action = $action");
        params.action = filters.action.trim();
    }
    if (filters.resourceType?.trim()) {
        parts.push("resource_type = $resourceType");
        params.resourceType = filters.resourceType.trim();
    }
    if (filters.search?.trim()) {
        parts.push("string::lowercase(summary) CONTAINS string::lowercase($search)");
        params.search = filters.search.trim();
    }
    if (filters.from) {
        parts.push("created_at >= $from");
        params.from = filters.from;
    }
    if (filters.to) {
        parts.push("created_at <= $to");
        params.to = filters.to;
    }

    const clause = parts.length > 0 ? `WHERE ${parts.join(" AND ")}` : "";
    return { clause, params };
}

export async function listAuditLogAction(filters: AuditListFilters = {}): Promise<{
    success: boolean;
    data?: AuditLogEntry[];
    total?: number;
    error?: string;
}> {
    const auth = await assertPlatformSession("audit.view");
    if (!auth.ok) return { success: false, error: auth.error };

    await ensureAuditReadyAction();
    const db = await getDb();
    try {
        const { clause, params } = buildAuditWhere(filters);
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM audit_log ${clause} ORDER BY created_at DESC LIMIT $limit START $offset`,
            params,
        );
        const countRows = await db.query<[Array<{ count?: number }>]>(
            `SELECT count() AS count FROM audit_log ${clause} GROUP ALL`,
            params,
        );
        const total = Number(countRows[0]?.[0]?.count ?? rows[0]?.length ?? 0);
        return {
            success: true,
            data: toPlain((rows[0] ?? []).map(serializeAuditRow)),
            total,
        };
    } catch (error) {
        console.error("listAuditLogAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar auditoria" };
    }
}

export async function listTenantAuditLogAction(filters: AuditListFilters = {}): Promise<{
    success: boolean;
    data?: AuditLogEntry[];
    total?: number;
    error?: string;
}> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    await ensureAuditReadyAction();
    const db = await getDb();
    try {
        const { clause, params } = buildAuditWhere({
            ...filters,
            scope: "tenant",
            tenantId: auth.ctx.tenantId,
        });
        const rows = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT * FROM audit_log ${clause} ORDER BY created_at DESC LIMIT $limit START $offset`,
            params,
        );
        const countRows = await db.query<[Array<{ count?: number }>]>(
            `SELECT count() AS count FROM audit_log ${clause} GROUP ALL`,
            params,
        );
        const total = Number(countRows[0]?.[0]?.count ?? rows[0]?.length ?? 0);
        return {
            success: true,
            data: toPlain((rows[0] ?? []).map(serializeAuditRow)),
            total,
        };
    } catch (error) {
        console.error("listTenantAuditLogAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar auditoria" };
    }
}

export async function exportAuditLogCsvAction(filters: AuditListFilters = {}): Promise<{
    success: boolean;
    data?: string;
    error?: string;
}> {
    const auth = await assertPlatformSession("audit.export");
    if (!auth.ok) return { success: false, error: auth.error };

    const list = await listAuditLogAction({ ...filters, limit: 5000, offset: 0 });
    if (!list.success || !list.data) {
        return { success: false, error: list.error ?? "Erro ao exportar" };
    }

    const header =
        "data,escopo,org_id,ator,tipo_acao,acao,recurso,id_recurso,resumo";
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = list.data.map((e) =>
        [
            esc(e.created_at.slice(0, 19).replace("T", " ")),
            esc(e.scope),
            esc(e.tenant_id ?? ""),
            esc(e.actor_email),
            esc(e.actor_kind),
            esc(e.action),
            esc(e.resource_type),
            esc(e.resource_id ?? ""),
            esc(e.summary),
        ].join(","),
    );

    return { success: true, data: [header, ...lines].join("\n") };
}
