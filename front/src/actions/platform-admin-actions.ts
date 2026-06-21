"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/lib/surreal";

export async function ensurePlatformAuditSchema(): Promise<void> {
    const db = await getDb();
    await db.query(`
        DEFINE TABLE IF NOT EXISTS platform_audit_log SCHEMALESS;
        DEFINE INDEX IF NOT EXISTS idx_platform_audit_tenant ON platform_audit_log FIELDS tenant_id;
        DEFINE INDEX IF NOT EXISTS idx_platform_audit_at ON platform_audit_log FIELDS created_at;
    `);
}

/** @deprecated Migrado para platform_role — use ensurePlatformRoleField em platform-team-actions */
export async function ensurePlatformMasterField(): Promise<void> {
    const { ensurePlatformRoleField } = await import("@/actions/platform-team-actions");
    await ensurePlatformRoleField();
}
