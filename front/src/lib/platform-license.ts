import type { TenantLicensePlan } from "@/types/tenant-types";

/** Metadados comerciais dos planos (revenda / SaaS). */
export type PlanDefinition = {
    id: TenantLicensePlan;
    label: string;
    description: string;
    monthlyPriceBrl: number;
    defaultMaxUsers: number;
    features: string[];
};

export const PLAN_IDS: TenantLicensePlan[] = ["trial", "standard", "professional"];

/** Valores padrão quando ainda não há configuração salva no banco. */
export const DEFAULT_PLATFORM_PLANS: Record<TenantLicensePlan, PlanDefinition> = {
    trial: {
        id: "trial",
        label: "Trial",
        description: "Avaliação gratuita por tempo limitado.",
        monthlyPriceBrl: 0,
        defaultMaxUsers: 3,
        features: ["Até 3 usuários", "Orçamentos e catálogo", "Suporte por e-mail"],
    },
    standard: {
        id: "standard",
        label: "Standard",
        description: "Pacote principal para empresas em operação.",
        monthlyPriceBrl: 497,
        defaultMaxUsers: 10,
        features: [
            "Até 10 usuários (ajustável)",
            "Orçamentos ilimitados",
            "Marca personalizada",
            "Suporte prioritário",
        ],
    },
    professional: {
        id: "professional",
        label: "Professional",
        description: "Operação ampliada com mais usuários e prioridade.",
        monthlyPriceBrl: 997,
        defaultMaxUsers: 30,
        features: [
            "Até 30 usuários (ajustável)",
            "Tudo do Standard",
            "Onboarding dedicado",
            "SLA comercial",
        ],
    },
};

/** @deprecated Use DEFAULT_PLATFORM_PLANS ou planos carregados do banco. */
export const PLATFORM_PLANS = DEFAULT_PLATFORM_PLANS;

function normalizePlan(
    id: TenantLicensePlan,
    raw: Record<string, unknown> | undefined,
): PlanDefinition {
    const base = DEFAULT_PLATFORM_PLANS[id];
    if (!raw) return { ...base };

    const featuresRaw = raw.features;
    const features = Array.isArray(featuresRaw)
        ? featuresRaw.map((f) => String(f).trim()).filter(Boolean)
        : base.features;

    const price = Number(raw.monthlyPriceBrl);
    const maxUsers = Number(raw.defaultMaxUsers);

    return {
        id,
        label: String(raw.label ?? base.label).trim() || base.label,
        description: String(raw.description ?? base.description).trim() || base.description,
        monthlyPriceBrl: Number.isFinite(price) && price >= 0 ? price : base.monthlyPriceBrl,
        defaultMaxUsers:
            Number.isFinite(maxUsers) && maxUsers >= 1
                ? Math.floor(maxUsers)
                : base.defaultMaxUsers,
        features: features.length > 0 ? features : base.features,
    };
}

export function mergePlatformPlans(
    stored: Record<string, unknown> | null | undefined,
): Record<TenantLicensePlan, PlanDefinition> {
    const plans = stored?.plans;
    const obj =
        plans && typeof plans === "object" && !Array.isArray(plans)
            ? (plans as Record<string, unknown>)
            : {};

    return {
        trial: normalizePlan("trial", obj.trial as Record<string, unknown> | undefined),
        standard: normalizePlan("standard", obj.standard as Record<string, unknown> | undefined),
        professional: normalizePlan(
            "professional",
            obj.professional as Record<string, unknown> | undefined,
        ),
    };
}

export function planMonthlyPrice(
    plan: TenantLicensePlan | null | undefined,
    plans: Record<TenantLicensePlan, PlanDefinition> = DEFAULT_PLATFORM_PLANS,
): number {
    const p = plan ?? "standard";
    return plans[p]?.monthlyPriceBrl ?? 0;
}

export function formatBrl(value: number): string {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Dias até expirar; null se sem data ou inválida. */
export function daysUntilExpiry(iso: string | null | undefined): number | null {
    if (!iso?.trim()) return null;
    const exp = Date.parse(iso);
    if (!Number.isFinite(exp)) return null;
    return Math.ceil((exp - Date.now()) / (24 * 60 * 60 * 1000));
}

export function userUsagePercent(used: number, max: number | null | undefined): number | null {
    if (max == null || max <= 0) return null;
    return Math.min(100, Math.round((used / max) * 100));
}

export function plansToFormState(
    plans: Record<TenantLicensePlan, PlanDefinition>,
): Record<TenantLicensePlan, PlanFormState> {
    return {
        trial: planToFormState(plans.trial),
        standard: planToFormState(plans.standard),
        professional: planToFormState(plans.professional),
    };
}

export type PlanFormState = {
    label: string;
    description: string;
    monthlyPriceBrl: string;
    defaultMaxUsers: string;
    featuresText: string;
};

function planToFormState(plan: PlanDefinition): PlanFormState {
    return {
        label: plan.label,
        description: plan.description,
        monthlyPriceBrl: String(plan.monthlyPriceBrl),
        defaultMaxUsers: String(plan.defaultMaxUsers),
        featuresText: plan.features.join("\n"),
    };
}

export function formStateToPlans(
    form: Record<TenantLicensePlan, PlanFormState>,
): Record<TenantLicensePlan, PlanDefinition> {
    const result = {} as Record<TenantLicensePlan, PlanDefinition>;
    for (const id of PLAN_IDS) {
        const row = form[id];
        result[id] = normalizePlan(id, {
            label: row.label,
            description: row.description,
            monthlyPriceBrl: Number(row.monthlyPriceBrl.replace(",", ".")),
            defaultMaxUsers: Number(row.defaultMaxUsers),
            features: row.featuresText
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean),
        });
    }
    return result;
}
