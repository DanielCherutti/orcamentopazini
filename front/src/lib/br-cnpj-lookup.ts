import { PRODUCT_USER_AGENT } from "@/lib/product-brand";
import { maskCep } from "@/lib/br-input-masks";

const CNPJ_LOOKUP_TIMEOUT_MS = 8000;

export type CnpjLookupResult =
    | {
          ok: true;
          name: string;
          cep: string;
          street: string;
          number: string;
          complement: string;
          neighborhood: string;
          city: string;
          state: string;
      }
    | { ok: false; error: string };

function strFromApi(v: unknown): string | undefined {
    if (v == null) return undefined;
    if (typeof v === "number" && Number.isFinite(v)) {
        return String(v);
    }
    const s = String(v).trim();
    return s.length > 0 ? s : undefined;
}

function pickStr(raw: Record<string, unknown>, keys: string[]): string | undefined {
    for (const k of keys) {
        const v = raw[k];
        const s = strFromApi(v);
        if (s) return s;
    }
    return undefined;
}

function formatCepFromApi(cep: unknown): string | undefined {
    const d = String(cep ?? "").replace(/\D/g, "").slice(0, 8);
    if (d.length !== 8) return undefined;
    return maskCep(d);
}

function flattenCnpjAddressRaw(raw: Record<string, unknown>): Record<string, unknown> {
    const nested = raw.endereco;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        const out: Record<string, unknown> = { ...raw };
        for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
            if (v != null && v !== "") {
                out[k] = v;
            }
        }
        return out;
    }
    return raw;
}

function extractCnpjAddressFromBrasilApiJson(raw: Record<string, unknown>) {
    const data = flattenCnpjAddressRaw(raw);
    const cepFormatted = formatCepFromApi(pickStr(data, ["cep"]) ?? data.cep) ?? "";
    const tipo = pickStr(data, ["descricao_tipo_de_logradouro", "tipo_logradouro"]);
    let street = pickStr(data, ["logradouro", "nome_logradouro", "endereco_logradouro"]);
    if (street && tipo) {
        const t = tipo.toUpperCase();
        const s = street.toUpperCase();
        if (!s.startsWith(t.slice(0, Math.min(4, t.length))) && !s.includes(t)) {
            street = `${tipo} ${street}`.trim();
        }
    }
    const number = pickStr(data, ["numero", "número", "numero_snv"]) ?? "";
    const complement = pickStr(data, ["complemento", "complement"]) ?? "";
    const neighborhood = pickStr(data, ["bairro"]) ?? "";
    const city = pickStr(data, ["municipio", "nome_municipio", "cidade"]) ?? "";
    const ufRaw = pickStr(data, ["uf", "sigla_uf"]);
    const state = ufRaw ? ufRaw.toUpperCase().slice(0, 2) : "";

    return {
        cep: cepFormatted,
        street: street ?? "",
        number,
        complement,
        neighborhood,
        city,
        state,
    };
}

/** Consulta CNPJ na Brasil API (uso interno — sem checagem de sessão). */
export async function lookupCnpjBrasilApi(cnpj: string): Promise<CnpjLookupResult> {
    const digits = cnpj.replace(/\D/g, "");
    if (digits.length !== 14) {
        return { ok: false, error: "CNPJ incompleto" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CNPJ_LOOKUP_TIMEOUT_MS);

    try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, {
            method: "GET",
            signal: controller.signal,
            headers: {
                Accept: "application/json",
                "User-Agent": `${PRODUCT_USER_AGENT} (cnpj-lookup)`,
            },
            cache: "no-store",
        });
        clearTimeout(timer);

        if (res.status === 404) {
            return { ok: false, error: "CNPJ não encontrado. Verifique os dígitos." };
        }
        if (!res.ok) {
            return { ok: false, error: "Consulta de CNPJ indisponível. Tente mais tarde." };
        }

        const raw = (await res.json()) as Record<string, unknown>;
        const name = (
            strFromApi(raw.razao_social) ||
            strFromApi(raw.nome_fantasia) ||
            ""
        ).trim();
        if (!name) {
            return { ok: false, error: "Não foi possível obter a razão social deste CNPJ." };
        }

        const addr = extractCnpjAddressFromBrasilApiJson(raw);
        return { ok: true, name, ...addr };
    } catch {
        clearTimeout(timer);
        return { ok: false, error: "Consulta de CNPJ indisponível. Tente mais tarde." };
    }
}

export type CepLookupResult =
    | {
          ok: true;
          street: string;
          neighborhood: string;
          city: string;
          state: string;
      }
    | { ok: false; error: string };

const CEP_LOOKUP_TIMEOUT_MS = 8000;

/** Consulta CEP no ViaCEP (uso interno — sem checagem de sessão). */
export async function lookupCepViaCep(cep: string): Promise<CepLookupResult> {
    const digits = cep.replace(/\D/g, "");
    if (digits.length !== 8) {
        return { ok: false, error: "CEP incompleto" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CEP_LOOKUP_TIMEOUT_MS);

    try {
        const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
            signal: controller.signal,
            cache: "no-store",
        });
        clearTimeout(timer);

        if (!res.ok) {
            return { ok: false, error: "CEP não encontrado. Preencha o endereço manualmente." };
        }

        const data = (await res.json()) as Record<string, unknown>;
        if (data.erro) {
            return { ok: false, error: "CEP não encontrado. Preencha o endereço manualmente." };
        }

        return {
            ok: true,
            street: String(data.logradouro ?? ""),
            neighborhood: String(data.bairro ?? ""),
            city: String(data.localidade ?? ""),
            state: String(data.uf ?? "").toUpperCase().slice(0, 2),
        };
    } catch {
        clearTimeout(timer);
        return { ok: false, error: "Serviço de CEP indisponível. Preencha o endereço manualmente." };
    }
}
