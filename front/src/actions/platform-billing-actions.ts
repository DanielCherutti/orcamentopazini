"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { StringRecordId, Table } from "surrealdb";

import { resolveTenantRef } from "@/actions/platform-helpers";
import { loadPlatformPlans } from "@/actions/platform-license-actions";
import { auditPlatformAction } from "@/lib/audit-log";
import {
    createAsaasCustomer,
    createAsaasPayment,
    deleteAsaasPayment,
    getAsaasPayment,
    mapAsaasStatusToChargeStatus,
} from "@/lib/asaas/client";
import { resolveAsaasConfig } from "@/lib/asaas/config";
import { ensureBillingAuditSchema } from "@/lib/billing-audit-schema";
import { planMonthlyPrice } from "@/lib/platform-license";
import { assertPlatformSession } from "@/lib/tenant-context";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";
import { tenantRecordId } from "@/lib/tenant-query";
import type { PlatformCharge, PlatformChargeStatus } from "@/types/billing-types";
import type { Tenant, TenantLicensePlan } from "@/types/tenant-types";

const billingProfileSchema = z.object({
    billing_email: z.string().trim().email("E-mail inválido"),
    billing_name: z.string().trim().min(2, "Nome obrigatório"),
    billing_cpf_cnpj: z.string().trim().min(11, "CPF/CNPJ inválido"),
    billing_phone: z.string().trim().optional(),
    billing_enabled: z.boolean().optional(),
});

const manualChargeSchema = z.object({
    amountBrl: z.coerce.number().positive("Valor deve ser positivo"),
    dueDate: z.string().min(10, "Informe o vencimento"),
    description: z.string().trim().min(3, "Descrição obrigatória"),
});

function orgPath(tenantRef: string): string {
    return `/platform/organizations/${encodeURIComponent(tenantRef)}`;
}

function serializeCharge(row: Record<string, unknown>): PlatformCharge {
    return {
        id: recordIdToString(row.id) ?? "",
        tenant_id: String(row.tenant_id ?? ""),
        type: row.type === "subscription" ? "subscription" : "manual",
        amount_cents: Number(row.amount_cents ?? 0),
        due_date: String(row.due_date ?? ""),
        description: String(row.description ?? ""),
        plan: row.plan != null ? String(row.plan) : null,
        billing_period: row.billing_period != null ? String(row.billing_period) : null,
        asaas_payment_id: row.asaas_payment_id != null ? String(row.asaas_payment_id) : null,
        asaas_invoice_url: row.asaas_invoice_url != null ? String(row.asaas_invoice_url) : null,
        billing_type: row.billing_type != null ? String(row.billing_type) : null,
        status: (String(row.status ?? "pending") as PlatformChargeStatus),
        paid_at: row.paid_at != null ? String(row.paid_at) : null,
        created_by: row.created_by != null ? String(row.created_by) : null,
        metadata: (row.metadata as Record<string, unknown>) ?? null,
        created_at: String(row.created_at ?? ""),
        updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
    };
}

export type TenantBillingProfileView = {
    billing_email: string | null;
    billing_name: string | null;
    billing_cpf_cnpj: string | null;
    billing_phone: string | null;
    asaas_customer_id: string | null;
    billing_enabled: boolean;
    profileComplete: boolean;
};

export async function getTenantBillingProfileAction(tenantRef: string): Promise<{
    success: boolean;
    data?: TenantBillingProfileView;
    error?: string;
}> {
    const auth = await assertPlatformSession("billing.view");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const raw = await db.select<Record<string, unknown>>(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Organização não encontrada" };

        const email = row.billing_email != null ? String(row.billing_email) : null;
        const name = row.billing_name != null ? String(row.billing_name) : null;
        const doc = row.billing_cpf_cnpj != null ? String(row.billing_cpf_cnpj) : null;

        return {
            success: true,
            data: {
                billing_email: email,
                billing_name: name,
                billing_cpf_cnpj: doc,
                billing_phone: row.billing_phone != null ? String(row.billing_phone) : null,
                asaas_customer_id:
                    row.asaas_customer_id != null ? String(row.asaas_customer_id) : null,
                billing_enabled: row.billing_enabled === true,
                profileComplete: !!(email && name && doc),
            },
        };
    } catch (error) {
        console.error("getTenantBillingProfileAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar perfil de cobrança" };
    }
}

export async function updateTenantBillingProfileAction(
    tenantRef: string,
    input: z.infer<typeof billingProfileSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]> }> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = billingProfileSchema.safeParse(input);
    if (!parsed.success) {
        const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
        return { success: false, fieldErrors: fe as Record<string, string[]> };
    }

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        await db.update(rid).merge({
            billing_email: parsed.data.billing_email.trim().toLowerCase(),
            billing_name: parsed.data.billing_name.trim(),
            billing_cpf_cnpj: parsed.data.billing_cpf_cnpj.replace(/\D/g, ""),
            billing_phone: parsed.data.billing_phone?.replace(/\D/g, "") ?? null,
            billing_enabled: parsed.data.billing_enabled ?? true,
            updated_at: new Date().toISOString(),
        });

        await auditPlatformAction({
            action: "billing.profile_update",
            resourceType: "tenant",
            resourceId: tenantId,
            tenantId,
            summary: `Perfil de cobrança atualizado para org ${tenantRef}`,
        });

        revalidatePath(orgPath(tenantRef));
        return { success: true };
    } catch (error) {
        console.error("updateTenantBillingProfileAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar perfil de cobrança" };
    }
}

async function ensureAsaasCustomerForTenant(
    db: Awaited<ReturnType<typeof getDb>>,
    tenantId: string,
): Promise<{ ok: true; customerId: string } | { ok: false; error: string }> {
    if (!(await resolveAsaasConfig())) {
        return { ok: false, error: "Asaas não configurado. Defina em Plataforma → Planos e preços → Integração Asaas." };
    }

    const raw = await db.select<Record<string, unknown>>(new StringRecordId(tenantId));
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) return { ok: false, error: "Organização não encontrada" };

    const email = row.billing_email != null ? String(row.billing_email).trim() : "";
    const name = row.billing_name != null ? String(row.billing_name).trim() : "";
    const doc = row.billing_cpf_cnpj != null ? String(row.billing_cpf_cnpj) : "";
    if (!email || !name || !doc) {
        return {
            ok: false,
            error: "Complete o perfil de cobrança (e-mail, nome e CPF/CNPJ) antes de gerar cobrança",
        };
    }

    const existing = row.asaas_customer_id != null ? String(row.asaas_customer_id) : "";
    if (existing) return { ok: true, customerId: existing };

    const created = await createAsaasCustomer({
        name,
        email,
        cpfCnpj: doc,
        phone: row.billing_phone != null ? String(row.billing_phone) : undefined,
        externalReference: tenantId,
    });
    if (!created.ok) return { ok: false, error: created.error };

    await db.update(new StringRecordId(tenantId)).merge({
        asaas_customer_id: created.customer.id,
        updated_at: new Date().toISOString(),
    });

    return { ok: true, customerId: created.customer.id };
}

export async function listPlatformChargesAction(tenantRef: string): Promise<{
    success: boolean;
    data?: PlatformCharge[];
    error?: string;
}> {
    const auth = await assertPlatformSession("billing.view");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensureBillingAuditSchema();
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        const rows = await db.query<[Array<Record<string, unknown>>]>(
            "SELECT * FROM platform_charge WHERE tenant_id = $tenantId ORDER BY created_at DESC LIMIT 100",
            { tenantId },
        );

        return { success: true, data: toPlain((rows[0] ?? []).map(serializeCharge)) };
    } catch (error) {
        console.error("listPlatformChargesAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar cobranças" };
    }
}

export async function createManualPlatformChargeAction(
    tenantRef: string,
    input: z.infer<typeof manualChargeSchema>,
): Promise<{ success: boolean; error?: string; fieldErrors?: Record<string, string[]>; data?: PlatformCharge }> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const parsed = manualChargeSchema.safeParse(input);
    if (!parsed.success) {
        const fe = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
        return { success: false, fieldErrors: fe as Record<string, string[]> };
    }

    const db = await getDb();
    try {
        await ensureBillingAuditSchema();
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        const customer = await ensureAsaasCustomerForTenant(db, tenantId);
        if (!customer.ok) return { success: false, error: customer.error };

        const dueDate = parsed.data.dueDate.slice(0, 10);
        const payment = await createAsaasPayment({
            customerId: customer.customerId,
            value: parsed.data.amountBrl,
            dueDate,
            description: parsed.data.description,
            externalReference: `manual:${tenantId}:${Date.now()}`,
        });
        if (!payment.ok) return { success: false, error: payment.error };

        const now = new Date().toISOString();
        const amount_cents = Math.round(parsed.data.amountBrl * 100);
        const insert = await db.create(new Table("platform_charge")).content({
            tenant_id: tenantId,
            type: "manual",
            amount_cents,
            due_date: dueDate,
            description: parsed.data.description,
            asaas_payment_id: payment.payment.id,
            asaas_invoice_url: payment.payment.invoiceUrl ?? payment.payment.bankSlipUrl ?? null,
            billing_type: payment.payment.billingType,
            status: mapAsaasStatusToChargeStatus(payment.payment.status),
            created_by: auth.ctx.email,
            created_at: now,
            updated_at: now,
        });
        const row = Array.isArray(insert) ? insert[0] : insert;
        const charge = serializeCharge(row as Record<string, unknown>);

        await auditPlatformAction({
            action: "billing.charge_create",
            resourceType: "platform_charge",
            resourceId: charge.id,
            tenantId,
            summary: `Cobrança manual R$ ${parsed.data.amountBrl.toFixed(2)} — ${parsed.data.description}`,
            metadata: { type: "manual", amount_cents },
        });

        revalidatePath(orgPath(tenantRef));
        return { success: true, data: toPlain(charge) };
    } catch (error) {
        console.error("createManualPlatformChargeAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao gerar cobrança" };
    }
}

export async function cancelPlatformChargeAction(
    tenantRef: string,
    chargeId: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformSession("billing.write");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        const raw = await db.select<Record<string, unknown>>(new StringRecordId(chargeId));
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row || String(row.tenant_id) !== tenantId) {
            return { success: false, error: "Cobrança não encontrada" };
        }
        if (row.status === "paid") {
            return { success: false, error: "Cobrança já paga não pode ser cancelada" };
        }

        const asaasId = row.asaas_payment_id != null ? String(row.asaas_payment_id) : "";
        if (asaasId) {
            const del = await deleteAsaasPayment(asaasId);
            if (!del.ok) return { success: false, error: del.error };
        }

        await db.update(new StringRecordId(chargeId)).merge({
            status: "cancelled",
            updated_at: new Date().toISOString(),
        });

        await auditPlatformAction({
            action: "billing.charge_cancel",
            resourceType: "platform_charge",
            resourceId: chargeId,
            tenantId,
            summary: `Cobrança cancelada (${chargeId})`,
        });

        revalidatePath(orgPath(tenantRef));
        return { success: true };
    } catch (error) {
        console.error("cancelPlatformChargeAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao cancelar cobrança" };
    }
}

export async function applyChargePaidEffects(chargeId: string): Promise<void> {
    const db = await getDb();
    const raw = await db.select<Record<string, unknown>>(new StringRecordId(chargeId));
    const row = Array.isArray(raw) ? raw[0] : raw;
    if (!row) return;

    const tenantId = String(row.tenant_id ?? "");
    const type = String(row.type ?? "");
    const now = new Date().toISOString();

    await db.update(new StringRecordId(chargeId)).merge({
        status: "paid",
        paid_at: now,
        updated_at: now,
    });

    if (type === "subscription" && tenantId) {
        const tenantRaw = await db.select<Record<string, unknown>>(new StringRecordId(tenantId));
        const tenant = Array.isArray(tenantRaw) ? tenantRaw[0] : tenantRaw;
        const currentExp = tenant?.license_expires_at
            ? Date.parse(String(tenant.license_expires_at))
            : Date.now();
        const base = Number.isNaN(currentExp) ? Date.now() : Math.max(currentExp, Date.now());
        const next = new Date(base);
        next.setUTCDate(next.getUTCDate() + 30);

        await db.update(new StringRecordId(tenantId)).merge({
            license_expires_at: next.toISOString(),
            active: true,
            updated_at: now,
        });
    }
}

export async function syncPlatformChargeFromAsaas(
    asaasPaymentId: string,
    eventStatus?: string,
): Promise<{ success: boolean; chargeId?: string }> {
    await ensureBillingAuditSchema();
    const db = await getDb();
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM platform_charge WHERE asaas_payment_id = $pid LIMIT 1",
        { pid: asaasPaymentId },
    );
    const row = rows[0]?.[0];
    if (!row) return { success: false };

    const chargeId = recordIdToString(row.id)!;
    let status = eventStatus
        ? mapAsaasStatusToChargeStatus(eventStatus)
        : mapAsaasStatusToChargeStatus(String(row.status ?? "PENDING"));

    const remote = await getAsaasPayment(asaasPaymentId);
    if (remote.ok) {
        status = mapAsaasStatusToChargeStatus(remote.payment.status);
    }

    if (status === "paid") {
        await applyChargePaidEffects(chargeId);
    } else {
        await db.update(new StringRecordId(chargeId)).merge({
            status,
            updated_at: new Date().toISOString(),
        });
    }

    return { success: true, chargeId };
}

function billingPeriodKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addDaysIso(days: number, from = new Date()): string {
    const d = new Date(from);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export async function runBillingCycleAction(): Promise<{
    success: boolean;
    created: number;
    skipped: number;
    errors: string[];
}> {
    if (!(await resolveAsaasConfig())) {
        return { success: false, created: 0, skipped: 0, errors: ["Asaas não configurado"] };
    }

    await ensureBillingAuditSchema();
    const db = await getDb();
    const plans = await loadPlatformPlans();
    const period = billingPeriodKey();
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    const tenants = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM tenant WHERE deleted_at IS NONE AND active != false AND billing_enabled = true`,
    );

    for (const row of tenants[0] ?? []) {
        const tenantId = recordIdToString(row.id)!;
        const plan = (String(row.license_plan ?? "standard") as TenantLicensePlan);
        if (plan === "trial") {
            skipped++;
            continue;
        }

        const price = planMonthlyPrice(plan, plans);
        if (price <= 0) {
            skipped++;
            continue;
        }

        const exp = row.license_expires_at ? Date.parse(String(row.license_expires_at)) : null;
        if (exp != null && !Number.isNaN(exp)) {
            const daysUntil = Math.ceil((exp - Date.now()) / (86400000));
            if (daysUntil > 7) {
                skipped++;
                continue;
            }
        }

        const existing = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT id FROM platform_charge
             WHERE tenant_id = $tenantId AND billing_period = $period AND type = 'subscription'
             AND status INSIDE ['pending', 'paid'] LIMIT 1`,
            { tenantId, period },
        );
        if ((existing[0]?.length ?? 0) > 0) {
            skipped++;
            continue;
        }

        const customer = await ensureAsaasCustomerForTenant(db, tenantId);
        if (!customer.ok) {
            errors.push(`${row.slug}: ${customer.error}`);
            continue;
        }

        const dueDate = addDaysIso(7);
        const description = `Assinatura ${plan} — ${period}`;
        const payment = await createAsaasPayment({
            customerId: customer.customerId,
            value: price,
            dueDate,
            description,
            externalReference: `sub:${tenantId}:${period}`,
        });
        if (!payment.ok) {
            errors.push(`${row.slug}: ${payment.error}`);
            continue;
        }

        const now = new Date().toISOString();
        await db.create(new Table("platform_charge")).content({
            tenant_id: tenantId,
            type: "subscription",
            amount_cents: Math.round(price * 100),
            due_date: dueDate,
            description,
            plan,
            billing_period: period,
            asaas_payment_id: payment.payment.id,
            asaas_invoice_url: payment.payment.invoiceUrl ?? payment.payment.bankSlipUrl ?? null,
            billing_type: payment.payment.billingType,
            status: mapAsaasStatusToChargeStatus(payment.payment.status),
            created_by: "system",
            created_at: now,
            updated_at: now,
        });

        await auditPlatformAction({
            action: "billing.subscription_create",
            resourceType: "platform_charge",
            tenantId,
            summary: `Cobrança recorrente ${period} — ${String(row.name ?? row.slug)}`,
            actorEmail: "system",
            actorKind: "system",
            metadata: { plan, period, amount_cents: Math.round(price * 100) },
        });

        created++;
    }

    return { success: errors.length === 0, created, skipped, errors };
}

export async function getConfirmedRevenueThisMonthAction(): Promise<{
    success: boolean;
    amountCents?: number;
    error?: string;
}> {
    const auth = await assertPlatformSession("billing.view");
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        await ensureBillingAuditSchema();
        const start = new Date();
        start.setUTCDate(1);
        start.setUTCHours(0, 0, 0, 0);

        const rows = await db.query<[Array<{ total?: number }>]>(
            `SELECT math::sum(amount_cents) AS total FROM platform_charge
             WHERE status = 'paid' AND paid_at >= $start`,
            { start: start.toISOString() },
        );
        const total = Number(rows[0]?.[0]?.total ?? 0);
        return { success: true, amountCents: total };
    } catch (error) {
        console.error("getConfirmedRevenueThisMonthAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao calcular receita" };
    }
}
