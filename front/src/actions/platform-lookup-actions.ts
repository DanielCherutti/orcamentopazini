"use server";

import { assertPlatformSession } from "@/lib/tenant-context";
import { lookupCepViaCep, lookupCnpjBrasilApi } from "@/lib/br-cnpj-lookup";

export async function lookupCnpjPlatformAction(cnpj: string) {
    const auth = await assertPlatformSession("orgs.view");
    if (!auth.ok) return { success: false as const, error: auth.error };

    const result = await lookupCnpjBrasilApi(cnpj);
    if (!result.ok) return { success: false as const, error: result.error };

    return {
        success: true as const,
        name: result.name,
        cnpj_cep: result.cep,
        cnpj_logradouro: result.street,
        cnpj_numero: result.number,
        cnpj_complemento: result.complement,
        cnpj_bairro: result.neighborhood,
        cnpj_municipio: result.city,
        cnpj_uf: result.state,
    };
}

export async function lookupCepPlatformAction(cep: string) {
    const auth = await assertPlatformSession("orgs.view");
    if (!auth.ok) return { success: false as const, error: auth.error };

    const result = await lookupCepViaCep(cep);
    if (!result.ok) return { success: false as const, error: result.error };

    return {
        success: true as const,
        street: result.street,
        neighborhood: result.neighborhood,
        city: result.city,
        state: result.state,
    };
}
