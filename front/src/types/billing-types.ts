export type PlatformChargeType = "subscription" | "manual";

export type PlatformChargeStatus =
    | "pending"
    | "paid"
    | "overdue"
    | "cancelled"
    | "refunded";

export type PlatformCharge = {
    id: string;
    tenant_id: string;
    type: PlatformChargeType;
    amount_cents: number;
    due_date: string;
    description: string;
    plan?: string | null;
    billing_period?: string | null;
    asaas_payment_id?: string | null;
    asaas_invoice_url?: string | null;
    billing_type?: string | null;
    status: PlatformChargeStatus;
    paid_at?: string | null;
    created_by?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at: string;
    updated_at?: string;
};

export type TenantBillingProfile = {
    billing_email?: string | null;
    billing_name?: string | null;
    billing_cpf_cnpj?: string | null;
    billing_phone?: string | null;
    asaas_customer_id?: string | null;
    billing_enabled?: boolean;
};
