"use server";

import { revalidatePath } from "next/cache";
import { StringRecordId } from "surrealdb";
import { assertPlatformMasterSession } from "@/lib/tenant-context";
import {
    DEFAULT_PLATFORM_PLANS,
    formStateToPlans,
    mergePlatformPlans,
    plansToFormState,
    type PlanDefinition,
    type PlanFormState,
} from "@/lib/platform-license";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import type { Surreal } from "surrealdb";
import type { TenantLicensePlan } from "@/types/tenant-types";

const SETTINGS_ID = "platform_license_settings:singleton";

let tableEnsured = false;

/** Idempotente — necessário se o processo iniciou antes da tabela existir no schema. */
async function ensurePlatformLicenseSettingsTable(db: Surreal): Promise<void> {
    if (tableEnsured) return;
    await db.query("DEFINE TABLE IF NOT EXISTS platform_license_settings SCHEMALESS;");
    tableEnsured = true;
}

export async function loadPlatformPlans(): Promise<Record<TenantLicensePlan, PlanDefinition>> {
    const db = await getDb();
    try {
        await ensurePlatformLicenseSettingsTable(db);
        const rows = await db.query<[Array<{ plans?: Record<string, unknown> }>]>(
            "SELECT plans FROM $id LIMIT 1",
            { id: new StringRecordId(SETTINGS_ID) },
        );
        const row = rows[0]?.[0];
        if (!row?.plans) {
            return { ...DEFAULT_PLATFORM_PLANS };
        }
        return mergePlatformPlans({ plans: row.plans });
    } catch (error) {
        console.error("loadPlatformPlans:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { ...DEFAULT_PLATFORM_PLANS };
    }
}

export async function getPlatformLicenseSettingsAction(): Promise<{
    success: boolean;
    data?: {
        plans: Record<TenantLicensePlan, PlanDefinition>;
        form: Record<TenantLicensePlan, PlanFormState>;
        updatedAt: string | null;
    };
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensurePlatformLicenseSettingsTable(db);
        const rows = await db.query<
            [Array<{ plans?: Record<string, unknown>; updated_at?: string }>]
        >("SELECT plans, updated_at FROM $id LIMIT 1", {
            id: new StringRecordId(SETTINGS_ID),
        });
        const row = rows[0]?.[0];
        const plans = row?.plans
            ? mergePlatformPlans({ plans: row.plans })
            : { ...DEFAULT_PLATFORM_PLANS };

        return {
            success: true,
            data: toPlain({
                plans,
                form: plansToFormState(plans),
                updatedAt: row?.updated_at ?? null,
            }),
        };
    } catch (error) {
        console.error("getPlatformLicenseSettingsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar planos" };
    }
}

export async function updatePlatformLicenseSettingsAction(
    form: Record<TenantLicensePlan, PlanFormState>,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const plans = formStateToPlans(form);

    for (const id of ["trial", "standard", "professional"] as const) {
        const p = plans[id];
        if (!p.label.trim()) {
            return { success: false, error: `Nome do plano ${id} é obrigatório` };
        }
        if (p.monthlyPriceBrl < 0) {
            return { success: false, error: `Preço do plano ${p.label} não pode ser negativo` };
        }
        if (p.defaultMaxUsers < 1) {
            return {
                success: false,
                error: `Limite de usuários do plano ${p.label} deve ser pelo menos 1`,
            };
        }
    }

    const db = await getDb();
    const now = new Date().toISOString();
    const payload = {
        plans: {
            trial: plans.trial,
            standard: plans.standard,
            professional: plans.professional,
        },
        updated_at: now,
    };

    try {
        await ensurePlatformLicenseSettingsTable(db);
        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM $id LIMIT 1",
            { id: new StringRecordId(SETTINGS_ID) },
        );
        if ((existing[0]?.length ?? 0) > 0) {
            await db.query("UPDATE $id MERGE $patch", {
                id: new StringRecordId(SETTINGS_ID),
                patch: payload,
            });
        } else {
            await db.query("CREATE $id CONTENT $content", {
                id: new StringRecordId(SETTINGS_ID),
                content: payload,
            });
        }

        revalidatePath("/platform");
        revalidatePath("/platform/licenses");
        revalidatePath("/platform/organizations");
        return { success: true };
    } catch (error) {
        console.error("updatePlatformLicenseSettingsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar planos" };
    }
}

export async function resetPlatformLicenseSettingsAction(): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensurePlatformLicenseSettingsTable(db);
        const existing = await db.query<[unknown[]]>(
            "SELECT id FROM $id LIMIT 1",
            { id: new StringRecordId(SETTINGS_ID) },
        );
        const payload = {
            plans: DEFAULT_PLATFORM_PLANS,
            updated_at: new Date().toISOString(),
        };
        if ((existing[0]?.length ?? 0) > 0) {
            await db.query("UPDATE $id MERGE $patch", {
                id: new StringRecordId(SETTINGS_ID),
                patch: payload,
            });
        } else {
            await db.query("CREATE $id CONTENT $content", {
                id: new StringRecordId(SETTINGS_ID),
                content: payload,
            });
        }
        revalidatePath("/platform");
        revalidatePath("/platform/licenses");
        return { success: true };
    } catch (error) {
        console.error("resetPlatformLicenseSettingsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao restaurar padrões" };
    }
}
