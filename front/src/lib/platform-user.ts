import { StringRecordId } from "surrealdb";
import type { Surreal } from "surrealdb";
import { getDb } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";

/** Master da plataforma — não pertence a nenhuma organização cliente. */
export async function isPlatformMasterEmail(
    email: string,
    db?: Surreal,
): Promise<boolean> {
    const database = db ?? (await getDb());
    const normalized = email.trim().toLowerCase();
    const rows = await database.query<[Array<{ is_platform_master?: boolean }>]>(
        "SELECT is_platform_master FROM portal_user WHERE email = $email AND active != false LIMIT 1",
        { email: normalized },
    );
    const row = rows[0]?.[0];
    if (row?.is_platform_master === true) return true;

    /** Legado: membership com role master (será migrada pelo promote-master). */
    const userRows = await database.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
        { email: normalized },
    );
    const userId = recordIdToString(userRows[0]?.[0]?.id);
    if (!userId) return false;

    const legacy = await database.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND role = 'master' LIMIT 1",
        { userId: new StringRecordId(userId) },
    );
    return (legacy[0]?.length ?? 0) > 0;
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
