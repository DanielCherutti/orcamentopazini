import { StringRecordId, Table } from "surrealdb";
import { revalidatePath } from "next/cache";
import { getDb, resetDb, isTokenExpiredError } from "@/lib/surreal";
import { hashPassword } from "@/lib/password";
import { assertPasswordPolicy } from "@/lib/password-pwned";
import { tenantHasUserCapacity } from "@/lib/platform-user";
import { assertTenantOperationalForInvite } from "@/lib/tenant-invite-guard";
import { recordIdToString } from "@/lib/surreal-record-ids";
import { tenantRecordId } from "@/lib/tenant-query";
import type { OrganizationMemberRole } from "@/types/tenant-types";

export async function userHasTenantMembership(
    userId: string,
    tenantId: string,
): Promise<boolean> {
    const db = await getDb();
    const rows = await db.query<[unknown[]]>(
        "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
        {
            userId: new StringRecordId(userId),
            tenantId: tenantRecordId(tenantId),
        },
    );
    return (rows[0]?.length ?? 0) > 0;
}

export type CreateUserInTenantResult =
    | {
          success: true;
          message: string;
          userId?: string;
      }
    | {
          success: false;
          error?: string;
          fieldErrors?: Record<string, string[]>;
      };

export async function createUserInTenant(input: {
    tenantId: string;
    email: string;
    role: OrganizationMemberRole;
    password: string;
    passwordConfirm: string;
    revalidatePaths?: string[];
}): Promise<CreateUserInTenantResult> {
    const email = input.email.trim().toLowerCase();
    const tenantId = input.tenantId;
    const role = input.role;
    const { password, passwordConfirm } = input;

    const db = await getDb();
    try {
        const licenseBlock = await assertTenantOperationalForInvite(tenantId);
        if (licenseBlock) {
            return { success: false, error: licenseBlock };
        }

        const capacity = await tenantHasUserCapacity(tenantId, db);
        if (!capacity.ok) {
            return { success: false, error: capacity.error };
        }

        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
            { email },
        );
        const existingId = recordIdToString(existing[0]?.[0]?.id);

        if (existingId) {
            const inTenant = await userHasTenantMembership(existingId, tenantId);
            if (inTenant) {
                return {
                    success: false,
                    fieldErrors: { email: ["Este e-mail já pertence a esta organização"] },
                };
            }

            await db.create(new Table("portal_user_tenant")).content({
                user_id: new StringRecordId(existingId),
                tenant_id: tenantRecordId(tenantId),
                role,
                created_at: new Date().toISOString(),
            });

            for (const path of input.revalidatePaths ?? []) {
                revalidatePath(path);
            }

            return {
                success: true,
                userId: existingId,
                message: `${email} foi adicionado à organização com papel ${role}. A pessoa usa a senha já cadastrada para entrar.`,
            };
        }

        if (!password.trim()) {
            return {
                success: false,
                fieldErrors: { password: ["Informe a senha"] },
            };
        }
        if (!passwordConfirm.trim()) {
            return {
                success: false,
                fieldErrors: { passwordConfirm: ["Confirme a senha"] },
            };
        }
        if (password !== passwordConfirm) {
            return {
                success: false,
                fieldErrors: { passwordConfirm: ["As senhas não coincidem"] },
            };
        }

        const policy = await assertPasswordPolicy(password);
        if (!policy.ok) {
            return { success: false, fieldErrors: { password: policy.errors } };
        }

        const password_hash = await hashPassword(password);
        const now = new Date().toISOString();

        const insertResult = await db.insert(new Table("portal_user"), {
            email,
            active: true,
            password_hash,
            created_at: now,
            updated_at: now,
        });
        const createdRecord = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        const newId = createdRecord?.id != null ? String(createdRecord.id) : null;
        if (!newId) {
            return { success: false, error: "Erro ao criar usuário" };
        }

        try {
            await db.create(new Table("portal_user_tenant")).content({
                user_id: new StringRecordId(newId),
                tenant_id: tenantRecordId(tenantId),
                role,
                created_at: now,
            });
        } catch (membershipErr) {
            try {
                await db.delete(new StringRecordId(newId));
            } catch (delErr) {
                console.error("createUserInTenant rollback delete:", delErr);
            }
            throw membershipErr;
        }

        for (const path of input.revalidatePaths ?? []) {
            revalidatePath(path);
        }

        return {
            success: true,
            userId: newId,
            message: `Usuário ${email} criado. A pessoa já pode entrar com o e-mail e a senha definidos.`,
        };
    } catch (e) {
        console.error("createUserInTenant:", e);
        if (isTokenExpiredError(e)) resetDb();
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("unique") || msg.includes("IDX")) {
            return {
                success: false,
                fieldErrors: { email: ["Este e-mail já está cadastrado"] },
            };
        }
        return { success: false, error: "Erro ao criar usuário" };
    }
}