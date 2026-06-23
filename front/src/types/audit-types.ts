export type AuditScope = "platform" | "tenant";

export type AuditActorKind = "platform" | "org" | "system" | "impersonation";

export type AuditLogEntry = {
    id: string;
    scope: AuditScope;
    tenant_id?: string | null;
    actor_email: string;
    actor_kind: AuditActorKind;
    action: string;
    resource_type: string;
    resource_id?: string | null;
    summary: string;
    metadata?: Record<string, unknown> | null;
    ip?: string | null;
    created_at: string;
};

export type AuditListFilters = {
    tenantId?: string;
    scope?: AuditScope;
    actorEmail?: string;
    action?: string;
    resourceType?: string;
    search?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
};
