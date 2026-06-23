"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Table, StringRecordId } from "surrealdb";
import {
    assertAuthenticatedSession,
    assertPortalAdminSession,
    assertTenantSession,
    getSessionContext,
    setSessionContext,
    isMasterRole,
} from "@/lib/tenant-context";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { DEFAULT_TENANT_RECORD_ID } from "@/lib/tenant-constants";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import type { Tenant, TenantMembership, TenantRole } from "@/types/tenant-types";
import {
    getTenantAccessBlockReason,
    isTenantLicenseValid,
    tenantAccessLoginErrorParam,
} from "@/lib/tenant-license";

import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { auditTenantAction } from "@/lib/audit-log";

const SESSION_MAX_AGE = 60 * 60 * 8;

type TenantRowLite = {
    id: string;
    name: string;
    slug: string;
    active: boolean;
    license_expires_at: string | null;
};

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

async function loadTenantsByIds(ids: string[]): Promise<Map<string, TenantRowLite>> {
    const db = await getDb();
    const map = new Map<string, TenantRowLite>();
    if (ids.length === 0) return map;

    const rows = await db.query<
        [Array<{ id: unknown; name?: string; slug?: string; active?: boolean; license_expires_at?: string | null }>]
    >(
        "SELECT id, name, slug, active, license_expires_at FROM tenant WHERE id INSIDE $ids AND deleted_at IS NONE",
        { ids: ids.map((id) => new StringRecordId(id)) },
    );

    for (const row of rows[0] ?? []) {
        const id = recordIdToString(row.id);
        if (!id) continue;
        map.set(id, {
            id,
            name: String(row.name ?? ""),
            slug: String(row.slug ?? ""),
            active: row.active !== false,
            license_expires_at: row.license_expires_at != null ? String(row.license_expires_at) : null,
        });
    }
    return map;
}

export async function getUserMembershipsByEmail(
    email: string,
): Promise<TenantMembership[]> {
    const db = await getDb();
    const userRows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email AND active != false LIMIT 1",
        { email },
    );
    const userId = recordIdToString(userRows[0]?.[0]?.id);
    if (!userId) return [];

    const linkRows = await db.query<
        [Array<{ tenant_id: unknown; role?: string }>]
    >(
        "SELECT tenant_id, role FROM portal_user_tenant WHERE user_id = $userId",
        { userId: new StringRecordId(userId) },
    );

    const tenantIds: string[] = [];
    const roleByTenant = new Map<string, TenantRole>();
    for (const row of linkRows[0] ?? []) {
        const tenantId = recordIdToString(row.tenant_id);
        if (!tenantId) continue;
        const roleRaw = String(row.role ?? "user");
        if (roleRaw === "master") continue;
        const role: TenantRole = roleRaw === "admin" ? "admin" : "user";
        tenantIds.push(tenantId);
        roleByTenant.set(tenantId, role);
    }

    const tenants = await loadTenantsByIds(tenantIds);
    const memberships: TenantMembership[] = [];
    for (const tenantId of tenantIds) {
        const tenant = tenants.get(tenantId);
        const role = roleByTenant.get(tenantId);
        if (!tenant || !role) continue;
        if (!isTenantLicenseValid(tenant)) continue;
        memberships.push({
            tenantId,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            role,
        });
    }
    return memberships;
}

/** Memberships incluindo orgs bloqueadas (para mensagens de erro no login). */
export async function getUserMembershipsIncludingBlocked(
    email: string,
): Promise<{ valid: TenantMembership[]; blockedReason: "org_inactive" | "license_expired" | null }> {
    const db = await getDb();
    const userRows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email AND active != false LIMIT 1",
        { email },
    );
    const userId = recordIdToString(userRows[0]?.[0]?.id);
    if (!userId) return { valid: [], blockedReason: null };

    const linkRows = await db.query<[Array<{ tenant_id: unknown; role?: string }>]>(
        "SELECT tenant_id, role FROM portal_user_tenant WHERE user_id = $userId",
        { userId: new StringRecordId(userId) },
    );

    const tenantIds: string[] = [];
    const roleByTenant = new Map<string, TenantRole>();
    for (const row of linkRows[0] ?? []) {
        const tenantId = recordIdToString(row.tenant_id);
        if (!tenantId) continue;
        const roleRaw = String(row.role ?? "user");
        if (roleRaw === "master") continue;
        const role: TenantRole = roleRaw === "admin" ? "admin" : "user";
        tenantIds.push(tenantId);
        roleByTenant.set(tenantId, role);
    }

    const tenants = await loadTenantsByIds(tenantIds);
    const valid: TenantMembership[] = [];
    let blockedReason: "org_inactive" | "license_expired" | null = null;

    for (const tenantId of tenantIds) {
        const tenant = tenants.get(tenantId);
        const role = roleByTenant.get(tenantId);
        if (!tenant || !role) continue;
        const block = getTenantAccessBlockReason(tenant);
        if (block) {
            if (!blockedReason) blockedReason = tenantAccessLoginErrorParam(block);
            continue;
        }
        valid.push({
            tenantId,
            tenantName: tenant.name,
            tenantSlug: tenant.slug,
            role,
        });
    }
    return { valid, blockedReason };
}

export async function listMyTenantsAction(): Promise<{
    success: boolean;
    data?: TenantMembership[];
    error?: string;
}> {
    const auth = await assertAuthenticatedSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const data = await getUserMembershipsByEmail(auth.ctx.email);
        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listMyTenantsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar organizações" };
    }
}

export async function getActiveTenantSummaryAction(): Promise<{
    success: boolean;
    data?: { id: string; name: string; slug: string; role: TenantRole };
    error?: string;
}> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const db = await getDb();
        const rows = await db.query<[Array<{ name?: string; slug?: string }>]>(
            "SELECT name, slug FROM tenant WHERE id = $id LIMIT 1",
            { id: new StringRecordId(auth.ctx.tenantId) },
        );
        const row = rows[0]?.[0];
        return {
            success: true,
            data: toPlain({
                id: auth.ctx.tenantId,
                name: String(row?.name ?? "Organização"),
                slug: String(row?.slug ?? ""),
                role: auth.ctx.role,
            }),
        };
    } catch (error) {
        console.error("getActiveTenantSummaryAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar organização" };
    }
}

export async function switchTenantAction(tenantId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertAuthenticatedSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const memberships = await getUserMembershipsByEmail(auth.ctx.email);
        const match = memberships.find((m) => m.tenantId === tenantId);
        if (!match) {
            return { success: false, error: "Sem acesso a esta organização" };
        }

        await setSessionContext(
            {
                email: auth.ctx.email,
                tenantId: match.tenantId,
                role: match.role,
                pending: false,
                impersonation: null,
            },
            SESSION_MAX_AGE,
        );

        revalidatePath("/", "layout");
        return { success: true };
    } catch (error) {
        console.error("switchTenantAction:", error);
        return { success: false, error: "Erro ao trocar organização" };
    }
}

export async function switchTenantAndRedirectAction(tenantId: string) {
    const res = await switchTenantAction(tenantId);
    if (!res.success) {
        redirect(`/select-tenant?error=denied`);
    }
    redirect("/dashboard");
}

export async function listTenantsAction(): Promise<{
    success: boolean;
    data?: Tenant[];
    error?: string;
}> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!isMasterRole(auth.ctx.role)) {
        return { success: false, error: "Não autorizado" };
    }

    const db = await getDb();
    try {
        const rows = await db.query<[Tenant[]]>(
            "SELECT * FROM tenant WHERE deleted_at IS NONE ORDER BY name ASC",
        );
        const data = (rows[0] ?? []).map((row) => ({
            ...row,
            id: recordIdToString((row as unknown as { id: unknown }).id) || String(row.id),
        }));
        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listTenantsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar tenants" };
    }
}

export async function createTenantAction(input: {
    name: string;
    slug?: string;
}): Promise<{ success: boolean; data?: Tenant; error?: string }> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!isMasterRole(auth.ctx.role)) {
        return { success: false, error: "Não autorizado" };
    }

    const name = input.name?.trim();
    if (!name) return { success: false, error: "Nome é obrigatório" };

    const slug = slugify(input.slug?.trim() || name);
    if (!slug) return { success: false, error: "Slug inválido" };

    const db = await getDb();
    try {
        const dup = await db.query<[unknown[]]>(
            "SELECT id FROM tenant WHERE slug = $slug AND deleted_at IS NONE LIMIT 1",
            { slug },
        );
        if ((dup[0]?.length ?? 0) > 0) {
            return { success: false, error: "Slug já em uso" };
        }

        const created = await db.create(new Table("tenant")).content({
            name,
            slug,
            active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const row = Array.isArray(created) ? created[0] : created;
        const tenantData = toPlain({
            ...(row as object),
            id: recordIdToString((row as { id: unknown }).id),
        }) as Tenant;
        await auditTenantAction({
            action: "tenant.create",
            resourceType: "tenant",
            resourceId: tenantData.id,
            summary: `Organização criada: ${name}`,
            metadata: { slug },
        });
        return {
            success: true,
            data: tenantData,
        };
    } catch (error) {
        console.error("createTenantAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao criar organização" };
    }
}

export async function ensureDefaultTenantExists(): Promise<string> {
    const db = await getDb();
    const existing = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM tenant WHERE id = $id LIMIT 1",
        { id: new StringRecordId(DEFAULT_TENANT_RECORD_ID) },
    );
    if ((existing[0]?.length ?? 0) > 0) {
        return DEFAULT_TENANT_RECORD_ID;
    }

    await db.query(
        `CREATE tenant:pazini CONTENT {
            name: 'Pazini',
            slug: 'pazini',
            active: true,
            created_at: time::now(),
            updated_at: time::now()
        }`,
    );
    return DEFAULT_TENANT_RECORD_ID;
}

export async function updateTenantAction(input: {
    tenantId: string;
    name?: string;
    slug?: string;
    active?: boolean;
}): Promise<{ success: boolean; data?: Tenant; error?: string }> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!isMasterRole(auth.ctx.role)) {
        return { success: false, error: "Não autorizado" };
    }

    const tenantId = input.tenantId?.trim();
    if (!tenantId) return { success: false, error: "Organização inválida" };

    const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) return { success: false, error: "Nome é obrigatório" };
        patch.name = name;
    }
    if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        if (!slug) return { success: false, error: "Slug inválido" };
        patch.slug = slug;
    }
    if (input.active !== undefined) {
        patch.active = Boolean(input.active);
    }

    const db = await getDb();
    try {
        if (patch.slug) {
            const dup = await db.query<[unknown[]]>(
                "SELECT id FROM tenant WHERE slug = $slug AND id != $id AND deleted_at IS NONE LIMIT 1",
                { slug: patch.slug, id: new StringRecordId(tenantId) },
            );
            if ((dup[0]?.length ?? 0) > 0) {
                return { success: false, error: "Slug já em uso" };
            }
        }

        const rid = requireRecordId("tenant", tenantId);
        await db.update(rid).merge(patch);
        const raw = await db.select(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const tenantData = toPlain({
            ...(row as object),
            id: recordIdToString((row as { id: unknown }).id),
        }) as Tenant;
        await auditTenantAction({
            action: "tenant.update",
            resourceType: "tenant",
            resourceId: tenantId,
            summary: `Organização atualizada: ${tenantData.name ?? tenantId}`,
        });
        return {
            success: true,
            data: tenantData,
        };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateTenantAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar organização" };
    }
}

export async function deactivateTenantAction(tenantId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };
    if (!isMasterRole(auth.ctx.role)) {
        return { success: false, error: "Não autorizado" };
    }
    if (tenantId === DEFAULT_TENANT_RECORD_ID) {
        return { success: false, error: "Não é possível desativar a organização padrão" };
    }

    const db = await getDb();
    try {
        const rid = requireRecordId("tenant", tenantId);
        await db.update(rid).merge({
            active: false,
            deleted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        revalidatePath("/settings/tenants");
        await auditTenantAction({
            action: "tenant.deactivate",
            resourceType: "tenant",
            resourceId: tenantId,
            summary: `Organização desativada: ${tenantId}`,
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("deactivateTenantAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao desativar organização" };
    }
}

export async function listTenantMembersAction(tenantId?: string): Promise<{
    success: boolean;
    data?: Array<{
        membershipId: string;
        userId: string;
        email: string;
        role: TenantRole;
        active?: boolean;
        pending_setup?: boolean;
    }>;
    error?: string;
}> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const targetTenantId = tenantId?.trim() || auth.ctx.tenantId;
    if (targetTenantId !== auth.ctx.tenantId) {
        return { success: false, error: "Não autorizado" };
    }
    if (auth.ctx.role !== "admin") {
        return { success: false, error: "Não autorizado" };
    }

    const db = await getDb();
    try {
        const rows = await db.query<
            [
                Array<{
                    id: unknown;
                    role?: string;
                    user_id?: {
                        id?: unknown;
                        email?: string;
                        active?: boolean;
                        password_hash?: string;
                    };
                }>,
            ]
        >(
            "SELECT id, role, user_id FROM portal_user_tenant WHERE tenant_id = $tenantId FETCH user_id",
            { tenantId: new StringRecordId(targetTenantId) },
        );

        const data = (rows[0] ?? [])
            .map((row) => {
                const user = row.user_id;
                const userId = recordIdToString(user?.id);
                if (!userId || !user?.email) return null;
                const roleRaw = String(row.role ?? "user");
                if (roleRaw === "master") return null;
                const role: TenantRole = roleRaw === "admin" ? "admin" : "user";
                return {
                    membershipId: recordIdToString(row.id) ?? "",
                    userId,
                    email: String(user.email),
                    role,
                    active: user.active !== false,
                    pending_setup: !passwordHashLooksValid(user.password_hash),
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listTenantMembersAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar membros" };
    }
}

export async function updateTenantMemberRoleAction(input: {
    userId: string;
    tenantId?: string;
    role: TenantRole;
}): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const targetTenantId = input.tenantId?.trim() || auth.ctx.tenantId;
    if (targetTenantId !== auth.ctx.tenantId) {
        return { success: false, error: "Não autorizado" };
    }
    if (input.role === "master") {
        return { success: false, error: "Papel inválido" };
    }
    const role: TenantRole = input.role === "admin" ? "admin" : "user";
    const sessionEmail = auth.ctx.email.trim().toLowerCase();
    const db = await getDb();
    try {
        const userRid = requireRecordId("portal_user", input.userId);
        const userRaw = await db.select<{ email?: string }>(userRid);
        const userRow = Array.isArray(userRaw) ? userRaw[0] : userRaw;
        const email = String(userRow?.email ?? "").trim().toLowerCase();
        if (email === sessionEmail) {
            return { success: false, error: "Você não pode alterar o seu próprio papel" };
        }

        const tenantRid = requireRecordId("tenant", targetTenantId);
        const rows = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
            { userId: userRid, tenantId: tenantRid },
        );
        const membershipId = recordIdToString(rows[0]?.[0]?.id);
        if (!membershipId) {
            return { success: false, error: "Membro não encontrado nesta organização" };
        }

        await db.update(requireRecordId("portal_user_tenant", membershipId)).merge({
            role,
        });
        revalidatePath("/settings/users");
        await auditTenantAction({
            action: "tenant_member.role_update",
            resourceType: "portal_user",
            resourceId: input.userId,
            tenantId: targetTenantId,
            summary: `Papel do membro alterado para ${role}`,
            metadata: { role },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updateTenantMemberRoleAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar papel" };
    }
}

export async function removeTenantMemberAction(input: {
    userId: string;
    tenantId?: string;
}): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const targetTenantId = input.tenantId?.trim() || auth.ctx.tenantId;
    if (targetTenantId !== auth.ctx.tenantId) {
        return { success: false, error: "Não autorizado" };
    }

    const sessionEmail = auth.ctx.email.trim().toLowerCase();
    const db = await getDb();
    try {
        const userRid = requireRecordId("portal_user", input.userId);
        const userRaw = await db.select<{ email?: string }>(userRid);
        const userRow = Array.isArray(userRaw) ? userRaw[0] : userRaw;
        const email = String(userRow?.email ?? "").trim().toLowerCase();
        if (email === sessionEmail) {
            return { success: false, error: "Você não pode remover a si mesmo desta organização" };
        }

        const tenantRid = requireRecordId("tenant", targetTenantId);
        const rows = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
            { userId: userRid, tenantId: tenantRid },
        );
        const membershipId = rows[0]?.[0]?.id;
        if (!membershipId) {
            return { success: false, error: "Membro não encontrado" };
        }

        const remaining = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM portal_user_tenant WHERE tenant_id = $tenantId",
            { tenantId: tenantRid },
        );
        if ((remaining[0]?.length ?? 0) <= 1) {
            return {
                success: false,
                error: "Deve existir pelo menos um usuário nesta organização",
            };
        }

        await db.delete(requireRecordId("portal_user_tenant", recordIdToString(membershipId)!));
        revalidatePath("/settings/users");
        await auditTenantAction({
            action: "tenant_member.remove",
            resourceType: "portal_user",
            resourceId: input.userId,
            tenantId: targetTenantId,
            summary: `Membro ${email} removido da organização`,
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("removeTenantMemberAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao remover membro" };
    }
}

export async function assignUserToTenantAction(input: {
    userId: string;
    tenantId: string;
    role: TenantRole;
}): Promise<{ success: boolean; error?: string }> {
    const auth = await assertTenantSession();
    if (!auth.ok) return { success: false, error: auth.error };

    if (auth.ctx.role !== "admin" || auth.ctx.tenantId !== input.tenantId) {
        return { success: false, error: "Não autorizado" };
    }
    if (input.role === "master") {
        return { success: false, error: "Papel inválido" };
    }
    const role: TenantRole = input.role === "admin" ? "admin" : "user";

    const db = await getDb();
    try {
        const userRid = requireRecordId("portal_user", input.userId);
        const tenantRid = requireRecordId("tenant", input.tenantId);

        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
            { userId: userRid, tenantId: tenantRid },
        );
        if ((existing[0]?.length ?? 0) > 0) {
            return { success: false, error: "Usuário já vinculado a esta organização" };
        }

        await db.create(new Table("portal_user_tenant")).content({
            user_id: userRid,
            tenant_id: tenantRid,
            role,
            created_at: new Date().toISOString(),
        });
        await auditTenantAction({
            action: "tenant_member.assign",
            resourceType: "portal_user",
            resourceId: input.userId,
            tenantId: input.tenantId,
            summary: `Usuário vinculado à organização com papel ${role}`,
            metadata: { role },
        });
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("assignUserToTenantAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao vincular usuário" };
    }
}

export async function resolvePostLoginRedirect(
    email: string,
): Promise<
    | "/dashboard"
    | "/select-tenant"
    | "/?error=no_tenant"
    | "/?error=org_inactive"
    | "/?error=license_expired"
> {
    const { valid: memberships, blockedReason } =
        await getUserMembershipsIncludingBlocked(email);

    if (memberships.length === 0) {
        if (blockedReason) return `/?error=${blockedReason}` as const;
        return "/?error=no_tenant";
    }
    if (memberships.length === 1) {
        await setSessionContext(
            {
                email,
                tenantId: memberships[0]!.tenantId,
                role: memberships[0]!.role,
                pending: false,
                impersonation: null,
            },
            SESSION_MAX_AGE,
        );
        return "/dashboard";
    }

    await setSessionContext({ email, pending: true, impersonation: null }, SESSION_MAX_AGE);
    return "/select-tenant";
}

export async function getSessionTenantContextAction(): Promise<{
    success: boolean;
    data?: {
        email: string;
        tenantId: string | null;
        tenantName: string | null;
        role: TenantRole | null;
        pending: boolean;
    };
    error?: string;
}> {
    const ctx = await getSessionContext();
    if (!ctx) return { success: false, error: "Não autorizado" };

    let tenantName: string | null = null;
    if (ctx.tenantId) {
        try {
            const db = await getDb();
            const rows = await db.query<[Array<{ name?: string }>]>(
                "SELECT name FROM tenant WHERE id = $id LIMIT 1",
                { id: new StringRecordId(ctx.tenantId) },
            );
            tenantName = rows[0]?.[0]?.name ? String(rows[0][0].name) : null;
        } catch {
            tenantName = null;
        }
    }

    return {
        success: true,
        data: toPlain({
            email: ctx.email,
            tenantId: ctx.tenantId,
            tenantName,
            role: ctx.role,
            pending: ctx.pending,
        }),
    };
}
