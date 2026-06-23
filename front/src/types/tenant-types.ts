export type TenantRole = "admin" | "user" | "master";

/** Papéis válidos dentro de uma organização cliente (master não pertence a org). */
export type OrganizationMemberRole = "admin" | "user";

export type TenantLicensePlan = "trial" | "standard" | "professional";

export type Tenant = {
    id: string;
    name: string;
    slug: string;
    active?: boolean;
    deleted_at?: string | null;
    max_users?: number | null;
    license_plan?: TenantLicensePlan;
    license_expires_at?: string | null;
    subdomain?: string | null;
    custom_domain?: string | null;
    custom_domain_verified_at?: string | null;
    require_custom_host?: boolean;
    billing_email?: string | null;
    billing_name?: string | null;
    billing_cpf_cnpj?: string | null;
    billing_phone?: string | null;
    asaas_customer_id?: string | null;
    billing_enabled?: boolean;
    company_cnpj?: string | null;
    company_ie?: string | null;
    company_contact_name?: string | null;
    company_contact_phone?: string | null;
    company_contact_email?: string | null;
    company_cep?: string | null;
    company_street?: string | null;
    company_number?: string | null;
    company_complement?: string | null;
    company_neighborhood?: string | null;
    company_city?: string | null;
    company_state?: string | null;
    created_at?: string;
    updated_at?: string;
};
export type PortalUserTenant = {
    id?: string;
    user_id: string;
    tenant_id: string;
    role: TenantRole;
    created_at?: string;
};

export type TenantMembership = {
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: TenantRole;
};
