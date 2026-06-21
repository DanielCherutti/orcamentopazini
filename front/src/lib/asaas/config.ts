import { StringRecordId } from "surrealdb";
import { getDb, isTokenExpiredError, resetDb } from "@/lib/surreal";
import { ensureBillingAuditSchema } from "@/lib/billing-audit-schema";
import type { AsaasEnv } from "@/lib/asaas/client";

export const PLATFORM_BILLING_SETTINGS_ID = "platform_billing_settings:singleton";

export type PlatformBillingSettingsRow = {
    asaas_api_key?: string;
    asaas_env?: string;
    asaas_webhook_token?: string;
    updated_at?: string;
    updated_by?: string;
};

export type AsaasRuntimeConfig = {
    apiKey: string;
    env: AsaasEnv;
    webhookToken: string;
    source: "database" | "env";
};

export type PlatformAsaasSettingsPublic = {
    env: AsaasEnv;
    webhookToken: string;
    apiKeyConfigured: boolean;
    apiKeyHint: string | null;
    source: "database" | "env" | "none";
    updatedAt: string | null;
    updatedBy: string | null;
};

function maskApiKeyHint(key: string): string {
    const k = key.trim();
    if (k.length <= 4) return "••••";
    return `••••${k.slice(-4)}`;
}

export async function loadPlatformBillingSettingsRow(): Promise<PlatformBillingSettingsRow | null> {
    await ensureBillingAuditSchema();
    const db = await getDb();
    try {
        const rows = await db.query<[PlatformBillingSettingsRow[]]>(
            "SELECT asaas_api_key, asaas_env, asaas_webhook_token, updated_at, updated_by FROM $id LIMIT 1",
            { id: new StringRecordId(PLATFORM_BILLING_SETTINGS_ID) },
        );
        return rows[0]?.[0] ?? null;
    } catch (error) {
        console.error("loadPlatformBillingSettingsRow:", error);
        if (isTokenExpiredError(error)) resetDb();
        return null;
    }
}

export async function resolveAsaasConfig(): Promise<AsaasRuntimeConfig | null> {
    const row = await loadPlatformBillingSettingsRow();
    const dbKey = row?.asaas_api_key?.trim();
    if (dbKey && row) {
        const envRaw = row.asaas_env?.trim().toLowerCase();
        return {
            apiKey: dbKey,
            env: envRaw === "production" ? "production" : "sandbox",
            webhookToken: row.asaas_webhook_token?.trim() ?? "",
            source: "database",
        };
    }

    const envKey = process.env.ASAAS_API_KEY?.trim();
    if (!envKey) return null;

    const envRaw = process.env.ASAAS_ENV?.trim().toLowerCase();
    return {
        apiKey: envKey,
        env: envRaw === "production" ? "production" : "sandbox",
        webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "",
        source: "env",
    };
}

export async function getPlatformAsaasSettingsPublic(): Promise<PlatformAsaasSettingsPublic> {
    const row = await loadPlatformBillingSettingsRow();
    const dbKey = row?.asaas_api_key?.trim();
    if (dbKey) {
        return {
            env: row?.asaas_env?.trim().toLowerCase() === "production" ? "production" : "sandbox",
            webhookToken: row?.asaas_webhook_token?.trim() ?? "",
            apiKeyConfigured: true,
            apiKeyHint: maskApiKeyHint(dbKey),
            source: "database",
            updatedAt: row?.updated_at ?? null,
            updatedBy: row?.updated_by ?? null,
        };
    }

    const envKey = process.env.ASAAS_API_KEY?.trim();
    if (envKey) {
        const envRaw = process.env.ASAAS_ENV?.trim().toLowerCase();
        return {
            env: envRaw === "production" ? "production" : "sandbox",
            webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "",
            apiKeyConfigured: true,
            apiKeyHint: maskApiKeyHint(envKey),
            source: "env",
            updatedAt: null,
            updatedBy: null,
        };
    }

    return {
        env: "sandbox",
        webhookToken: "",
        apiKeyConfigured: false,
        apiKeyHint: null,
        source: "none",
        updatedAt: row?.updated_at ?? null,
        updatedBy: row?.updated_by ?? null,
    };
}

/** @deprecated Use resolveAsaasConfig — mantido só para compatibilidade síncrona com .env */
export function getAsaasConfigFromEnv(): AsaasRuntimeConfig | null {
    const envKey = process.env.ASAAS_API_KEY?.trim();
    if (!envKey) return null;
    const envRaw = process.env.ASAAS_ENV?.trim().toLowerCase();
    return {
        apiKey: envKey,
        env: envRaw === "production" ? "production" : "sandbox",
        webhookToken: process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "",
        source: "env",
    };
}
