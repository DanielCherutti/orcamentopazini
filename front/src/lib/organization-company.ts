import type { Tenant } from "@/types/tenant-types";
import { maskCep, maskCnpj, maskPhone } from "@/lib/br-input-masks";

export type OrganizationCompanyFormValues = {
    cnpj: string;
    ie: string;
    legalName: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
};

export const EMPTY_ORGANIZATION_COMPANY: OrganizationCompanyFormValues = {
    cnpj: "",
    ie: "",
    legalName: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    cep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
};

export function organizationCompanyFromTenant(
    tenant: Pick<
        Tenant,
        | "name"
        | "company_cnpj"
        | "company_ie"
        | "company_contact_name"
        | "company_contact_phone"
        | "company_contact_email"
        | "company_cep"
        | "company_street"
        | "company_number"
        | "company_complement"
        | "company_neighborhood"
        | "company_city"
        | "company_state"
    >,
): OrganizationCompanyFormValues {
    const cnpjDigits = tenant.company_cnpj?.replace(/\D/g, "") ?? "";
    const cepDigits = tenant.company_cep?.replace(/\D/g, "") ?? "";
    const phoneDigits = tenant.company_contact_phone?.replace(/\D/g, "") ?? "";

    return {
        cnpj: cnpjDigits ? maskCnpj(cnpjDigits) : "",
        ie: tenant.company_ie ?? "",
        legalName: tenant.name ?? "",
        contactName: tenant.company_contact_name ?? "",
        contactPhone: phoneDigits ? maskPhone(phoneDigits) : "",
        contactEmail: tenant.company_contact_email ?? "",
        cep: cepDigits ? maskCep(cepDigits) : "",
        street: tenant.company_street ?? "",
        number: tenant.company_number ?? "",
        complement: tenant.company_complement ?? "",
        neighborhood: tenant.company_neighborhood ?? "",
        city: tenant.company_city ?? "",
        state: tenant.company_state ?? "",
    };
}

export type OrganizationCompanyInput = {
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
};

export function normalizeOrganizationCompanyInput(
    values: OrganizationCompanyFormValues,
): OrganizationCompanyInput {
    const cnpj = values.cnpj.replace(/\D/g, "");
    const cep = values.cep.replace(/\D/g, "");
    const phone = values.contactPhone.replace(/\D/g, "");
    const email = values.contactEmail.trim().toLowerCase();

    return {
        company_cnpj: cnpj || null,
        company_ie: values.ie.trim() || null,
        company_contact_name: values.contactName.trim() || null,
        company_contact_phone: phone || null,
        company_contact_email: email || null,
        company_cep: cep || null,
        company_street: values.street.trim() || null,
        company_number: values.number.trim() || null,
        company_complement: values.complement.trim() || null,
        company_neighborhood: values.neighborhood.trim() || null,
        company_city: values.city.trim() || null,
        company_state: values.state.trim().toUpperCase().slice(0, 2) || null,
    };
}
