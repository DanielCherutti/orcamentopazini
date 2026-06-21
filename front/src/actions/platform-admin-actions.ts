"use server";

import { revalidatePath } from "next/cache";
import { StringRecordId, Table } from "surrealdb";

import { assertPlatformMasterSession, getSessionContext } from "@/lib/tenant-context";
import { isPlatformMasterEmail } from "@/lib/platform-user";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

export type PlatformAdminItem = {
    userId: string;
    email: string;
    active: boolean;
};

export type PlatformAdminCandidate = {
    userId: string;
    email: string;
    active: boolean;
    pending_setup: boolean;
    organization_count: number;
};

async function countPlatformMasters(db: Awaited<ReturnType<typeof getDb>>): Promise<number> {
    const rows = await db.query<[Array<{ count: number }>]>(
        "SELECT count() AS count FROM portal_user WHERE is_platform_master = true GROUP ALL",
    );
    return Number(rows[0]?.[0]?.count ?? 0);
}

export async function listPlatformAdminsAction(): Promise<{
    success: boolean;
    data?: PlatformAdminItem[];
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rows = await db.query<[Array<{ id: unknown; email?: string; active?: boolean }>]>(
            "SELECT id, email, active FROM portal_user WHERE is_platform_master = true ORDER BY email ASC",
        );
        const data = (rows[0] ?? []).map((row) => ({
            userId: recordIdToString(row.id) ?? "",
            email: String(row.email ?? ""),
            active: row.active !== false,
        }));
        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listPlatformAdminsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar admins" };
    }
}

/** Usuários do portal que ainda não são admin da plataforma (seleção para promover). */
export async function listPlatformAdminCandidatesAction(): Promise<{
    success: boolean;
    data?: PlatformAdminCandidate[];
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rows = await db.query<
            [Array<{ id: unknown; email?: string; active?: boolean; password_hash?: string }>]
        >(
            `SELECT id, email, active, password_hash FROM portal_user
             WHERE active != false
               AND (is_platform_master IS NONE OR is_platform_master = false)
             ORDER BY email ASC`,
        );

        const data: PlatformAdminCandidate[] = [];
        for (const row of rows[0] ?? []) {
            const userId = recordIdToString(row.id);
            if (!userId || !row.email) continue;

            const memberRows = await db.query<[Array<{ count: number }>]>(
                "SELECT count() AS count FROM portal_user_tenant WHERE user_id = $userId GROUP ALL",
                { userId: requireRecordId("portal_user", userId) },
            );

            data.push({
                userId,
                email: String(row.email).trim().toLowerCase(),
                active: row.active !== false,
                pending_setup: !passwordHashLooksValid(row.password_hash),
                organization_count: Number(memberRows[0]?.[0]?.count ?? 0),
            });
        }

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listPlatformAdminCandidatesAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar usuários" };
    }
}

export async function promotePlatformAdminByUserIdAction(userId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const id = userId?.trim();
    if (!id) return { success: false, error: "Selecione um usuário" };

    const db = await getDb();
    try {
        const userRid = requireRecordId("portal_user", id);
        const raw = await db.select<{
            email?: string;
            active?: boolean;
            password_hash?: string;
            is_platform_master?: boolean;
        }>(userRid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Usuário não encontrado" };
        if (row.is_platform_master === true) {
            return { success: false, error: "Este usuário já é admin da plataforma" };
        }
        if (row.active === false) {
            return { success: false, error: "Usuário inativo" };
        }
        if (!passwordHashLooksValid(row.password_hash)) {
            return {
                success: false,
                error: "Usuário ainda não ativou a conta (senha pendente). Conclua o cadastro antes de promover.",
            };
        }

        await db.update(userRid).merge({
            is_platform_master: true,
            updated_at: new Date().toISOString(),
        });
        await db.query("DELETE portal_user_tenant WHERE user_id = $userId", { userId: userRid });

        revalidatePath("/platform/admins");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("promotePlatformAdminByUserIdAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao promover admin" };
    }
}

/** @deprecated Use promotePlatformAdminByUserIdAction */
export async function promotePlatformAdminAction(email: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return { success: false, error: "E-mail obrigatório" };

    const db = await getDb();
    const userRows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
        { email: normalized },
    );
    const userId = recordIdToString(userRows[0]?.[0]?.id);
    if (!userId) return { success: false, error: "Usuário não encontrado" };
    return promotePlatformAdminByUserIdAction(userId);
}

export async function demotePlatformAdminByUserIdAction(userId: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const id = userId?.trim();
    if (!id) return { success: false, error: "Usuário inválido" };

    const ctx = await getSessionContext();
    const db = await getDb();

    try {
        const userRid = requireRecordId("portal_user", id);
        const raw = await db.select<{ email?: string; is_platform_master?: boolean }>(userRid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row || row.is_platform_master !== true) {
            return { success: false, error: "Admin da plataforma não encontrado" };
        }

        const email = String(row.email ?? "").trim().toLowerCase();
        if (ctx?.email.toLowerCase() === email) {
            const total = await countPlatformMasters(db);
            if (total <= 1) {
                return { success: false, error: "Não é possível remover o último admin da plataforma" };
            }
        }

        await db.update(userRid).merge({
            is_platform_master: false,
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/platform/admins");
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("demotePlatformAdminByUserIdAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao revogar admin" };
    }
}

/** @deprecated Use demotePlatformAdminByUserIdAction */
export async function demotePlatformAdminAction(email: string): Promise<{
    success: boolean;
    error?: string;
}> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return { success: false, error: "E-mail obrigatório" };

    const db = await getDb();
    const userRows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email AND is_platform_master = true LIMIT 1",
        { email: normalized },
    );
    const userId = recordIdToString(userRows[0]?.[0]?.id);
    if (!userId) return { success: false, error: "Admin da plataforma não encontrado" };
    return demotePlatformAdminByUserIdAction(userId);
}

export async function ensurePlatformAuditSchema(): Promise<void> {
    const db = await getDb();
    await db.query(`
        DEFINE TABLE IF NOT EXISTS platform_audit_log SCHEMALESS;
        DEFINE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_log FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_platform_audit_at ON platform_audit_log FIELDS created_at;
    `);
}

/** Backfill is_platform_master field (idempotente). */
export async function ensurePlatformMasterField(): Promise<void> {
    const db = await getDb();
    await db.query(`
        UPDATE portal_user SET is_platform_master = false WHERE is_platform_master IS NONE;
    `);
}

export async function isEmailPlatformMaster(email: string): Promise<boolean> {
    return isPlatformMasterEmail(email);
}
