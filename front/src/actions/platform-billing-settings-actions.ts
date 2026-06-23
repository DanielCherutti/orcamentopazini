"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { StringRecordId } from "surrealdb";

import { auditPlatformAction } from "@/lib/audit-log";
import { ensureBillingAuditSchema } from "@/lib/billing-audit-schema";
import {
    getPlatformAsaasSettingsPublic,
    loadPlatformBillingSettingsRow,
    PLATFORM_BILLING_SETTINGS_ID,
    resolveAsaasConfig,
    type AsaasRuntimeConfig,
} from "@/lib/asaas/config";
import { testAsaasConnectionWithConfig } from "@/lib/asaas/test-connection";
import { assertPlatformSession } from "@/lib/tenant-context";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import type { AsaasEnv } from "@/lib/asaas/client";

const saveSchema = z.object({
    env: z.enum(["sandbox", "production"]),
    apiKey: z.string().optional(),
    webhookToken: z.string().optional(),
});

import type { PlatformAsaasSettingsPublic } from "@/lib/asaas/config";

export async function getPlatformAsaasSettingsAction(): Promise<{
    success: boolean;
    data?: PlatformAsaasSettingsPublic;
    error?: string;
}> {
    const auth = await assertPlatformSession("billing.view");
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const data = await getPlatformAsaasSettingsPublic();
        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("getPlatformAsaasSettingsAction:", error);
        return { success: false, error: "Erro ao carregar integração Asaas" };
    }
}

export async function updatePlatformAsaasSettingsAction(input: {
    env: AsaasEnv;
    apiKey?: string;
    webhookToken?: string;
}): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = saveSchema.safeParse(input);
    if (!parsed.success) {
        return { success: false, error: "Dados inválidos" };
    }

    const db = await getDb();
    try {
        await ensureBillingAuditSchema();
        const existing = await loadPlatformBillingSettingsRow();
        const newKey = parsed.data.apiKey?.trim();
        const apiKey = newKey || existing?.asaas_api_key?.trim();

        if (!apiKey) {
            return {
                success: false,
                fieldErrors: { apiKey: ["Informe a chave de API do Asaas"] },
            };
        }

        const now = new Date().toISOString();
        await db.query(
            `UPSERT $id CONTENT {
                asaas_api_key: $apiKey,
                asaas_env: $env,
                asaas_webhook_token: $webhookToken,
                updated_at: $now,
                updated_by: $by
            }`,
            {
                id: new StringRecordId(PLATFORM_BILLING_SETTINGS_ID),
                apiKey,
                env: parsed.data.env,
                webhookToken: parsed.data.webhookToken?.trim() ?? "",
                now,
                by: auth.ctx.email,
            },
        );

        await auditPlatformAction({
            action: "billing.asaas_settings_update",
            resourceType: "platform_billing_settings",
            resourceId: PLATFORM_BILLING_SETTINGS_ID,
            summary: `Integração Asaas atualizada (${parsed.data.env})`,
            metadata: { env: parsed.data.env },
        });

        revalidatePath("/platform/licenses");
        return { success: true };
    } catch (error) {
        console.error("updatePlatformAsaasSettingsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar integração Asaas" };
    }
}

async function configForTest(input?: {
    apiKey?: string;
    env?: AsaasEnv;
}): Promise<AsaasRuntimeConfig | null> {
    const draftKey = input?.apiKey?.trim();
    if (draftKey) {
        return {
            apiKey: draftKey,
            env: input?.env ?? "sandbox",
            webhookToken: "",
            source: "database",
        };
    }
    return resolveAsaasConfig();
}

export async function testPlatformAsaasConnectionAction(input?: {
    apiKey?: string;
    env?: AsaasEnv;
}): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    accountName?: string;
    env?: AsaasEnv;
}> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const config = await configForTest(input);
    if (!config) {
        return {
            success: false,
            error: "Informe a chave de API ou salve a configuração antes de testar",
        };
    }

    const result = await testAsaasConnectionWithConfig(config);
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    const label =
        result.account.name ||
        result.account.company ||
        result.account.email ||
        "Conta Asaas";

    return {
        success: true,
        message: `Conexão OK (${result.env})`,
        accountName: label,
        env: result.env,
    };
}

export async function clearPlatformAsaasSettingsAction(): Promise<{
    success: boolean;
    error?: string;
}> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensureBillingAuditSchema();
        await db.query(
            `UPSERT $id CONTENT {
                asaas_api_key: NONE,
                asaas_env: 'sandbox',
                asaas_webhook_token: '',
                updated_at: $now,
                updated_by: $by
            }`,
            {
                id: new StringRecordId(PLATFORM_BILLING_SETTINGS_ID),
                now: new Date().toISOString(),
                by: auth.ctx.email,
            },
        );

        await auditPlatformAction({
            action: "billing.asaas_settings_clear",
            resourceType: "platform_billing_settings",
            resourceId: PLATFORM_BILLING_SETTINGS_ID,
            summary: "Integração Asaas removida do banco (fallback .env se existir)",
        });

        revalidatePath("/platform/licenses");
        return { success: true };
    } catch (error) {
        console.error("clearPlatformAsaasSettingsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao limpar configuração" };
    }
}
