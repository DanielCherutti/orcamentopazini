import { StringRecordId } from "surrealdb";
import type { Surreal } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";
import { isPlatformRole, type PlatformRole } from "@/types/platform-types";

export type PortalUserKind = "org" | "platform" | "unknown";

function normalizePlatformRole(raw: unknown): PlatformRole | null {
    if (isPlatformRole(raw)) return raw;
    if (raw === true) return "super_admin";
    return null;
}

export async function getPlatformRoleForEmail(
    email: string,
    db?: Surreal,
): Promise<PlatformRole | null> {
    const database = db ?? (await getDb());
    const normalized = email.trim().toLowerCase();
    const rows = await database.query<
        [Array<{ platform_role?: unknown; is_platform_master?: boolean }>]
    >(
        "SELECT platform_role, is_platform_master FROM portal_user WHERE email = $email AND active != false LIMIT 1",
        { email: normalized },
    );
    const row = rows[0]?.[0];
    const fromField = normalizePlatformRole(row?.platform_role);
    if (fromField) return fromField;
    if (row?.is_platform_master === true) return "super_admin";
    return null;
}

/** @deprecated Use getPlatformRoleForEmail */
export async function isPlatformMasterEmail(
    email: string,
    db?: Surreal,
): Promise<boolean> {
    return (await getPlatformRoleForEmail(email, db)) != null;
}

export async function getPortalUserIdByEmail(
    email: string,
    db?: Surreal,
): Promise<string | null> {
    const database = db ?? (await getDb());
    const rows = await database.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
        { email: email.trim().toLowerCase() },
    );
    return recordIdToString(rows[0]?.[0]?.id);
}

export async function userHasOrgMembership(
    userId: string,
    db?: Surreal,
): Promise<boolean> {
    const database = db ?? (await getDb());
    const rows = await database.query<[Array<{ count: number }>]>(
        "SELECT count() AS count FROM portal_user_tenant WHERE user_id = $userId GROUP ALL",
        { userId: new StringRecordId(userId) },
    );
    return Number(rows[0]?.[0]?.count ?? 0) > 0;
}

export async function emailHasOrgMembership(
    email: string,
    db?: Surreal,
): Promise<boolean> {
    const userId = await getPortalUserIdByEmail(email, db);
    if (!userId) return false;
    return userHasOrgMembership(userId, db);
}

export async function classifyPortalUserEmail(
    email: string,
    db?: Surreal,
): Promise<PortalUserKind> {
    const database = db ?? (await getDb());
    const platformRole = await getPlatformRoleForEmail(email, database);
    if (platformRole) return "platform";
    const hasOrg = await emailHasOrgMembership(email, database);
    if (hasOrg) return "org";
    return "unknown";
}

/** Bloqueia convite de org se o e-mail já é usuário da plataforma. */
export async function assertEmailAvailableForOrgInvite(
    email: string,
    db?: Surreal,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const role = await getPlatformRoleForEmail(email, db);
    if (role) {
        return {
            ok: false,
            error:
                "Este e-mail pertence à equipe da plataforma e não pode ser convidado para uma organização.",
        };
    }
    return { ok: true };
}

/** Bloqueia convite de plataforma se o e-mail já tem membership em org. */
export async function assertEmailAvailableForPlatformInvite(
    email: string,
    db?: Surreal,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const hasOrg = await emailHasOrgMembership(email, db);
    if (hasOrg) {
        return {
            ok: false,
            error:
                "Este e-mail já é usuário de uma organização. Contas de plataforma e de empresa são separadas.",
        };
    }
    const role = await getPlatformRoleForEmail(email, db);
    if (role) {
        return {
            ok: false,
            error: "Este e-mail já faz parte da equipe da plataforma.",
        };
    }
    return { ok: true };
}

export async function countActiveTenantMembers(
    tenantId: string,
    db?: Surreal,
): Promise<number> {
    const database = db ?? (await getDb());
    const rows = await database.query<[Array<{ count: number }>]>(
        `SELECT count() AS count FROM portal_user_tenant
         WHERE tenant_id = $tenantId AND role IN ['admin', 'user']
         GROUP ALL`,
        { tenantId: new StringRecordId(tenantId) },
    );
    return Number(rows[0]?.[0]?.count ?? 0);
}

export async function getTenantMaxUsers(
    tenantId: string,
    db?: Surreal,
): Promise<number | null> {
    const database = db ?? (await getDb());
    const rows = await database.query<[Array<{ max_users?: number | null }>]>(
        "SELECT max_users FROM tenant WHERE id = $tenantId LIMIT 1",
        { tenantId: new StringRecordId(tenantId) },
    );
    const max = rows[0]?.[0]?.max_users;
    if (max == null || max <= 0) return null;
    return Math.floor(max);
}

/** Verifica se a org ainda pode receber mais membros (admin/user). */
export async function tenantHasUserCapacity(
    tenantId: string,
    db?: Surreal,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const database = db ?? (await getDb());
    const max = await getTenantMaxUsers(tenantId, database);
    if (max == null) return { ok: true };
    const count = await countActiveTenantMembers(tenantId, database);
    if (count >= max) {
        return {
            ok: false,
            error: `Limite de usuários atingido (${count}/${max}). Ajuste a licença no admin da plataforma.`,
        };
    }
    return { ok: true };
}

export async function countPlatformUsersByRole(
    role: PlatformRole,
    db?: Surreal,
): Promise<number> {
    const database = db ?? (await getDb());
    const rows = await database.query<[Array<{ count: number }>]>(
        "SELECT count() AS count FROM portal_user WHERE platform_role = $role AND active != false GROUP ALL",
        { role },
    );
    return Number(rows[0]?.[0]?.count ?? 0);
}
