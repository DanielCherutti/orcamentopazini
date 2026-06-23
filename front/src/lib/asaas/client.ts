import { resolveAsaasConfig, type AsaasRuntimeConfig } from "@/lib/asaas/config";

export type AsaasEnv = "sandbox" | "production";

export type AsaasCustomer = {
    id: string;
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
};

export type AsaasPayment = {
    id: string;
    customer: string;
    billingType: string;
    value: number;
    dueDate: string;
    description?: string;
    status: string;
    invoiceUrl?: string;
    bankSlipUrl?: string;
    dateCreated?: string;
    paymentDate?: string;
};

export type AsaasWebhookEvent = {
    event: string;
    payment?: AsaasPayment;
};

export function getAsaasBaseUrl(env: AsaasEnv = "sandbox"): string {
    return env === "production"
        ? "https://api.asaas.com/v3"
        : "https://api-sandbox.asaas.com/v3";
}

export function getAsaasConfig(): {
    apiKey: string;
    env: AsaasEnv;
    webhookToken: string;
} | null {
    const envKey = process.env.ASAAS_API_KEY?.trim();
    if (!envKey) return null;
    const envRaw = process.env.ASAAS_ENV?.trim().toLowerCase();
    const env: AsaasEnv = envRaw === "production" ? "production" : "sandbox";
    const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "";
    return { apiKey: envKey, env, webhookToken };
}

async function asaasFetch<T>(
    path: string,
    init?: RequestInit,
    configOverride?: AsaasRuntimeConfig | null,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
    const config = configOverride ?? (await resolveAsaasConfig());
    if (!config) {
        return {
            ok: false,
            error:
                "Asaas não configurado. Defina em Plataforma → Planos e preços → Integração Asaas.",
        };
    }
    const url = `${getAsaasBaseUrl(config.env)}${path}`;
    try {
        const res = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                access_token: config.apiKey,
                ...(init?.headers ?? {}),
            },
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            const errors = body.errors as Array<{ description?: string }> | undefined;
            const msg =
                errors?.map((e) => e.description).filter(Boolean).join("; ") ||
                String(body.message ?? body.error ?? res.statusText);
            return { ok: false, error: msg || "Erro na API Asaas" };
        }
        return { ok: true, data: body as T };
    } catch (error) {
        console.error("asaasFetch:", path, error);
        return { ok: false, error: "Falha ao comunicar com Asaas" };
    }
}

export async function createAsaasCustomer(input: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
    externalReference?: string;
}): Promise<{ ok: true; customer: AsaasCustomer } | { ok: false; error: string }> {
    const cpfCnpj = input.cpfCnpj.replace(/\D/g, "");
    const res = await asaasFetch<AsaasCustomer>("/customers", {
        method: "POST",
        body: JSON.stringify({
            name: input.name,
            email: input.email,
            cpfCnpj,
            phone: input.phone?.replace(/\D/g, "") || undefined,
            externalReference: input.externalReference,
            notificationDisabled: false,
        }),
    });
    if (!res.ok) return res;
    return { ok: true, customer: res.data };
}

export async function createAsaasPayment(input: {
    customerId: string;
    value: number;
    dueDate: string;
    description: string;
    billingType?: "BOLETO" | "PIX" | "UNDEFINED";
    externalReference?: string;
}): Promise<{ ok: true; payment: AsaasPayment } | { ok: false; error: string }> {
    const res = await asaasFetch<AsaasPayment>("/payments", {
        method: "POST",
        body: JSON.stringify({
            customer: input.customerId,
            billingType: input.billingType ?? "UNDEFINED",
            value: input.value,
            dueDate: input.dueDate,
            description: input.description,
            externalReference: input.externalReference,
        }),
    });
    if (!res.ok) return res;
    return { ok: true, payment: res.data };
}

export async function getAsaasPayment(
    paymentId: string,
): Promise<{ ok: true; payment: AsaasPayment } | { ok: false; error: string }> {
    const res = await asaasFetch<AsaasPayment>(`/payments/${encodeURIComponent(paymentId)}`);
    if (!res.ok) return res;
    return { ok: true, payment: res.data };
}

export async function deleteAsaasPayment(
    paymentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await asaasFetch<unknown>(`/payments/${encodeURIComponent(paymentId)}`, {
        method: "DELETE",
    });
    if (!res.ok) return res;
    return { ok: true };
}

export function mapAsaasStatusToChargeStatus(
    asaasStatus: string,
): "pending" | "paid" | "overdue" | "cancelled" {
    const s = asaasStatus.toUpperCase();
    if (s === "RECEIVED" || s === "CONFIRMED" || s === "RECEIVED_IN_CASH") return "paid";
    if (s === "OVERDUE") return "overdue";
    if (s === "DELETED" || s === "REFUNDED") return "cancelled";
    return "pending";
}
