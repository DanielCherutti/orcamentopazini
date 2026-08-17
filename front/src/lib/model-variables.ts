import type { CustomerFull } from "@/actions/client-actions";
import type { Budget } from "@/types/budget-types";

export type TemplateVariableToken = {
  token: string;
  label: string;
  group: "Cliente" | "Orçamento" | "Data e hora" | "Campos personalizados";
  description?: string;
};

export const TEMPLATE_VARIABLE_TOKENS: TemplateVariableToken[] = [
  {
    token: "{{cliente.logo}}",
    label: "Logo do cliente",
    group: "Cliente",
    description: "Insere a logomarca cadastrada no cliente.",
  },
  {
    token: "{{cliente.razao_social}}",
    label: "Razão social",
    group: "Cliente",
  },
  {
    token: "{{cliente.nome_fantasia}}",
    label: "Nome fantasia",
    group: "Cliente",
  },
  {
    token: "{{cliente.cnpj}}",
    label: "CNPJ",
    group: "Cliente",
  },
  {
    token: "{{cliente.endereco}}",
    label: "Endereço completo",
    group: "Cliente",
  },
  {
    token: "{{cliente.cidade}}",
    label: "Cidade",
    group: "Cliente",
  },
  {
    token: "{{cliente.bairro}}",
    label: "Bairro",
    group: "Cliente",
  },
  {
    token: "{{orcamento.codigo}}",
    label: "Código do orçamento",
    group: "Orçamento",
  },
  {
    token: "{{numero.revisao}}",
    label: "Número da revisão",
    group: "Orçamento",
    description: "00 no orçamento original; 01, 02… nas revisões.",
  },
  {
    token: "{{data.atual}}",
    label: "Data atual",
    group: "Data e hora",
    description: "Data por extenso no fuso de Brasília.",
  },
  {
    token: "{{hora.atual}}",
    label: "Hora atual",
    group: "Data e hora",
    description: "Horário atual no fuso de Brasília.",
  },
  {
    token: "{{cliente.adicional.inscricao_estadual}}",
    label: "Campo personalizado",
    group: "Campos personalizados",
    description: "Troque o último trecho pelo nome do campo salvo no cliente.",
  },
];

export type TemplateVariableContext = {
  cliente?: {
    razao_social?: string | null;
    nome_fantasia?: string | null;
    cnpj?: string | null;
    endereco?: string | null;
    cidade?: string | null;
    bairro?: string | null;
    logo?: string | null;
    adicional?: Record<string, unknown> | null;
  } | null;
  orcamento?: {
    codigo?: string | null;
  } | null;
  numero?: {
    revisao?: string | null;
  } | null;
  data?: {
    atual?: string | null;
  } | null;
  hora?: {
    atual?: string | null;
  } | null;
};

export type RenderTemplateVariableOptions = {
  /**
   * Em HTML rico, `{{cliente.logo}}` vira uma tag img. Em campos URL, use "url".
   */
  logoMode?: "img" | "url";
  /**
   * Escapa texto antes da substituição. Use true para HTML vindo do editor.
   */
  escapeText?: boolean;
};

const VARIABLE_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function normalizeAdditionalInfoKey(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function formatCustomerAddress(customer?: CustomerFull | null): string {
  const address = customer?.address;
  if (!address) return "";
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const districtLine = [address.neighborhood, address.complement].filter(Boolean).join(" - ");
  const cityLine = [address.city, address.state].filter(Boolean).join("/");
  return [streetLine, districtLine, cityLine, address.cep].filter(Boolean).join(" - ");
}

export function buildTemplateVariableContext(params: {
  customer?: CustomerFull | null;
  budget?: Pick<Budget, "code" | "revision_number"> | null;
  now?: Date;
  timeZone?: string;
}): TemplateVariableContext {
  const customer = params.customer;
  const now = params.now ?? new Date();
  const timeZone = params.timeZone?.trim() || process.env.APP_TIME_ZONE || "America/Sao_Paulo";
  const currentDate = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone,
  })
    .format(now)
    .replace(/\s+de\s+/gi, " DE ")
    .toLocaleUpperCase("pt-BR");
  const currentTime = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);
  const rawRevisionNumber = Number(params.budget?.revision_number ?? 0);
  const revisionNumber =
    Number.isFinite(rawRevisionNumber) && rawRevisionNumber >= 1
      ? Math.trunc(rawRevisionNumber)
      : 0;
  return {
    cliente: {
      razao_social: customer?.razao_social || customer?.name || "",
      nome_fantasia: customer?.nome_fantasia || "",
      cnpj: customer?.cnpj || "",
      endereco: formatCustomerAddress(customer),
      cidade: customer?.address?.city || customer?.city || "",
      bairro: customer?.address?.neighborhood || "",
      logo: customer?.logo_url || "",
      adicional: customer?.informacoes_adicionais || {},
    },
    orcamento: {
      codigo: params.budget?.code || "",
    },
    numero: {
      revisao: String(revisionNumber).padStart(2, "0"),
    },
    data: {
      atual: currentDate,
    },
    hora: {
      atual: currentTime,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function safeLogoUrl(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/api/uploads/") || value.startsWith("/uploads/")) return value;
  return "";
}

function valueToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function lookupAdditionalValue(
  additional: Record<string, unknown> | null | undefined,
  key: string,
): string {
  if (!additional || !key) return "";
  if (Object.prototype.hasOwnProperty.call(additional, key)) {
    return valueToString(additional[key]);
  }
  const normalized = normalizeAdditionalInfoKey(key);
  if (Object.prototype.hasOwnProperty.call(additional, normalized)) {
    return valueToString(additional[normalized]);
  }
  const found = Object.entries(additional).find(
    ([candidate]) => normalizeAdditionalInfoKey(candidate) === normalized,
  );
  return found ? valueToString(found[1]) : "";
}

function resolveVariable(
  path: string,
  context: TemplateVariableContext,
  options: Required<RenderTemplateVariableOptions>,
): string {
  const normalizedPath = path.trim().toLowerCase();
  if (normalizedPath === "cliente.logo") {
    const url = safeLogoUrl(context.cliente?.logo);
    if (!url) return "";
    if (options.logoMode === "url") return url;
    return `<img src="${escapeAttribute(url)}" alt="Logo do cliente" style="max-width:180px;max-height:80px;object-fit:contain;" />`;
  }
  if (normalizedPath === "cliente.razao_social") return valueToString(context.cliente?.razao_social);
  if (normalizedPath === "cliente.nome_fantasia") return valueToString(context.cliente?.nome_fantasia);
  if (normalizedPath === "cliente.cnpj") return valueToString(context.cliente?.cnpj);
  if (normalizedPath === "cliente.endereco") return valueToString(context.cliente?.endereco);
  if (normalizedPath === "cliente.cidade") return valueToString(context.cliente?.cidade);
  if (normalizedPath === "cliente.bairro") return valueToString(context.cliente?.bairro);
  if (normalizedPath === "orcamento.codigo") return valueToString(context.orcamento?.codigo);
  if (normalizedPath === "numero.revisao") return valueToString(context.numero?.revisao);
  if (normalizedPath === "data.atual") return valueToString(context.data?.atual);
  if (normalizedPath === "hora.atual") return valueToString(context.hora?.atual);
  if (normalizedPath.startsWith("cliente.adicional.")) {
    return lookupAdditionalValue(
      context.cliente?.adicional ?? {},
      path.slice("cliente.adicional.".length),
    );
  }
  return "";
}

export function renderTemplateVariables(
  input: string | null | undefined,
  context: TemplateVariableContext,
  options?: RenderTemplateVariableOptions,
): string {
  let source = String(input ?? "");
  if (!source.trim()) return source;
  const resolvedOptions: Required<RenderTemplateVariableOptions> = {
    logoMode: options?.logoMode ?? "img",
    escapeText: options?.escapeText ?? true,
  };
  if (resolvedOptions.logoMode === "img") {
    const logoUrl = safeLogoUrl(context.cliente?.logo);
    source = source.replace(/<img\b[^>]*>/gi, (tag) => {
      const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
      if (!srcMatch || !/\{\{\s*cliente\.logo\s*\}\}/i.test(srcMatch[2])) return tag;
      if (!logoUrl) return "";
      const withSource = tag.replace(srcMatch[0], `src=${srcMatch[1]}${escapeAttribute(logoUrl)}${srcMatch[1]}`);
      if (/\bobject-fit\s*:/i.test(withSource)) return withSource;
      if (/\bstyle\s*=\s*(["'])/i.test(withSource)) {
        return withSource.replace(/\bstyle\s*=\s*(["'])/i, (_full, quote: string) =>
          `style=${quote}object-fit: contain; max-width: 100%; `,
        );
      }
      return withSource.replace(/\s*\/?\s*>$/, ' style="object-fit: contain; max-width: 100%;" />');
    });
  }
  return source.replace(VARIABLE_RE, (_full, path: string) => {
    const resolved = resolveVariable(path, context, resolvedOptions);
    if (!resolved) return "";
    if (path.trim().toLowerCase() === "cliente.logo" && resolvedOptions.logoMode === "img") {
      return resolved;
    }
    return resolvedOptions.escapeText ? escapeHtml(resolved) : resolved;
  });
}
