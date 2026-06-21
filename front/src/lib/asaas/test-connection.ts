import type { AsaasEnv } from "@/lib/asaas/client";
import { getAsaasBaseUrl } from "@/lib/asaas/client";
import type { AsaasRuntimeConfig } from "@/lib/asaas/config";

export type AsaasAccountInfo = {
    id?: string;
    name?: string;
    email?: string;
    company?: string;
};

export async function testAsaasConnectionWithConfig(
    config: AsaasRuntimeConfig,
): Promise<
    | { ok: true; account: AsaasAccountInfo; env: AsaasEnv }
    | { ok: false; error: string }
> {
    const url = `${getAsaasBaseUrl(config.env)}/myAccount`;
    try {
        const res = await fetch(url, {
            headers: {
                "Content-Type": "application/json",
                access_token: config.apiKey,
            },
        });
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok) {
            const errors = body.errors as Array<{ description?: string }> | undefined;
            const msg =
                errors?.map((e) => e.description).filter(Boolean).join("; ") ||
                String(body.message ?? body.error ?? res.statusText);
            return { ok: false, error: msg || "Chave inválida ou ambiente incorreto" };
        }
        return {
            ok: true,
            env: config.env,
            account: {
                id: body.id != null ? String(body.id) : undefined,
                name: body.name != null ? String(body.name) : undefined,
                email: body.email != null ? String(body.email) : undefined,
                company: body.company != null ? String(body.company) : undefined,
            },
        };
    } catch (error) {
        console.error("testAsaasConnectionWithConfig:", error);
        return { ok: false, error: "Não foi possível conectar ao Asaas" };
    }
}
