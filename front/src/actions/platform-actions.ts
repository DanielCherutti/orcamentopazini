"use server";

import { revalidatePath } from "next/cache";
import { Table, StringRecordId } from "surrealdb";
import {
    assertPlatformMasterSession,
    setPlatformMasterSession,
} from "@/lib/tenant-context";
import { countActiveTenantMembers, isPlatformMasterEmail } from "@/lib/platform-user";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";
import { tenantRecordId } from "@/lib/tenant-query";
import {
    BRAND_DEFAULT_PRIMARY,
    BRAND_DEFAULT_SECONDARY,
    normalizeHex,
} from "@/lib/branding-theme";
import type { Tenant, TenantLicensePlan } from "@/types/tenant-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { Surreal } from "surrealdb";
import {
    daysUntilExpiry,
    planMonthlyPrice,
    userUsagePercent,
    type PlanDefinition,
} from "@/lib/platform-license";
import { loadPlatformPlans } from "@/actions/platform-license-actions";
import { getTenantPublicOrigin } from "@/lib/tenant-public-origin";
import { RESERVED_SUBDOMAINS } from "@/lib/tenant-host";
import { passwordHashLooksValid } from "@/lib/password-hash-present";
import { getTenantAccessBlockReason } from "@/lib/tenant-license";
import { resolveTenantRef } from "@/actions/platform-helpers";

function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

function serializeTenant(row: Record<string, unknown>): Tenant {
    return {
        id: recordIdToString(row.id) ?? "",
        name: String(row.name ?? ""),
        slug: String(row.slug ?? ""),
        active: row.active !== false,
        deleted_at: row.deleted_at != null ? String(row.deleted_at) : null,
        max_users: row.max_users != null ? Number(row.max_users) : null,
        license_plan: (["trial", "standard", "professional"].includes(
            String(row.license_plan ?? ""),
        )
            ? String(row.license_plan)
            : "standard") as TenantLicensePlan,
        license_expires_at:
            row.license_expires_at != null ? String(row.license_expires_at) : null,
        subdomain: row.subdomain != null ? String(row.subdomain) : null,
        custom_domain: row.custom_domain != null ? String(row.custom_domain) : null,
        custom_domain_verified_at:
            row.custom_domain_verified_at != null
                ? String(row.custom_domain_verified_at)
                : null,
        require_custom_host: row.require_custom_host === true,
        created_at: row.created_at != null ? String(row.created_at) : undefined,
        updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
    };
}

export type OrganizationListItem = Tenant & {
    member_count: number;
};

export async function resolvePlatformPostLoginRedirect(
    email: string,
): Promise<"/platform" | null> {
    if (!(await isPlatformMasterEmail(email))) return null;
    await setPlatformMasterSession(email);
    return "/platform";
}

export type PlatformDashboardAlert = {
    type: "expiring" | "expired" | "user_limit" | "inactive";
    organization: OrganizationListItem;
    detail: string;
};

export type PlatformDashboardData = {
    summary: {
        totalOrganizations: number;
        activeOrganizations: number;
        inactiveOrganizations: number;
        totalUsers: number;
        totalBudgets: number;
        totalClients: number;
        estimatedMrrBrl: number;
        newOrganizationsThisMonth: number;
        trialCount: number;
        paidCount: number;
    };
    planBreakdown: Array<{
        plan: TenantLicensePlan;
        count: number;
        activeCount: number;
        mrrBrl: number;
    }>;
    alerts: PlatformDashboardAlert[];
    topByUsers: OrganizationListItem[];
    recentOrganizations: OrganizationListItem[];
    plans: Record<TenantLicensePlan, PlanDefinition>;
    generatedAt: string;
};

async function loadAllOrganizations(db: Surreal): Promise<OrganizationListItem[]> {
    const rows = await db.query<[Array<Record<string, unknown>>]>(
        "SELECT * FROM tenant WHERE deleted_at IS NONE ORDER BY name ASC",
    );
    const items: OrganizationListItem[] = [];
    for (const row of rows[0] ?? []) {
        const tenant = serializeTenant(row);
        const member_count = await countActiveTenantMembers(tenant.id, db);
        items.push({ ...tenant, member_count });
    }
    return items;
}

function startOfMonthIso(): string {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export async function getPlatformDashboardAction(): Promise<{
    success: boolean;
    data?: PlatformDashboardData;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const [orgs, plans] = await Promise.all([
            loadAllOrganizations(db),
            loadPlatformPlans(),
        ]);
        const monthStart = startOfMonthIso();

        const [budgetRows, clientRows] = await Promise.all([
            db.query<[Array<{ count: number }>]>("SELECT count() AS count FROM budget GROUP ALL"),
            db.query<[Array<{ count: number }>]>("SELECT count() AS count FROM client GROUP ALL"),
        ]);

        const totalBudgets = Number(budgetRows[0]?.[0]?.count ?? 0);
        const totalClients = Number(clientRows[0]?.[0]?.count ?? 0);
        const totalUsers = orgs.reduce((s, o) => s + o.member_count, 0);
        const activeOrgs = orgs.filter((o) => o.active !== false);
        const inactiveOrgs = orgs.filter((o) => o.active === false);

        const planKeys: TenantLicensePlan[] = ["trial", "standard", "professional"];
        const planBreakdown = planKeys.map((plan) => {
            const matching = orgs.filter((o) => (o.license_plan ?? "standard") === plan);
            const activeCount = matching.filter((o) => o.active !== false).length;
            const unit = planMonthlyPrice(plan, plans);
            return {
                plan,
                count: matching.length,
                activeCount,
                mrrBrl: activeCount * unit,
            };
        });

        const estimatedMrrBrl = planBreakdown.reduce((s, p) => s + p.mrrBrl, 0);

        const newOrganizationsThisMonth = orgs.filter(
            (o) => o.created_at && o.created_at >= monthStart,
        ).length;

        const alerts: PlatformDashboardAlert[] = [];

        for (const org of orgs) {
            if (org.active === false) {
                alerts.push({
                    type: "inactive",
                    organization: org,
                    detail: "Organização desativada",
                });
                continue;
            }

            const days = daysUntilExpiry(org.license_expires_at);
            if (days != null && days < 0) {
                alerts.push({
                    type: "expired",
                    organization: org,
                    detail: `Licença vencida há ${Math.abs(days)} dia(s)`,
                });
            } else if (days != null && days <= 30) {
                alerts.push({
                    type: "expiring",
                    organization: org,
                    detail: days === 0 ? "Licença vence hoje" : `Licença vence em ${days} dia(s)`,
                });
            }

            const pct = userUsagePercent(org.member_count, org.max_users);
            if (pct != null && pct >= 90) {
                alerts.push({
                    type: "user_limit",
                    organization: org,
                    detail:
                        pct >= 100
                            ? "Limite de usuários atingido"
                            : `${pct}% do limite (${org.member_count}/${org.max_users})`,
                });
            }
        }

        alerts.sort((a, b) => {
            const order = { expired: 0, expiring: 1, user_limit: 2, inactive: 3 };
            return order[a.type] - order[b.type];
        });

        const topByUsers = [...orgs]
            .sort((a, b) => b.member_count - a.member_count)
            .slice(0, 5);

        const recentOrganizations = [...orgs]
            .sort((a, b) => {
                const ta = a.created_at ? Date.parse(a.created_at) : 0;
                const tb = b.created_at ? Date.parse(b.created_at) : 0;
                return tb - ta;
            })
            .slice(0, 6);

        return {
            success: true,
            data: toPlain({
                summary: {
                    totalOrganizations: orgs.length,
                    activeOrganizations: activeOrgs.length,
                    inactiveOrganizations: inactiveOrgs.length,
                    totalUsers,
                    totalBudgets,
                    totalClients,
                    estimatedMrrBrl,
                    newOrganizationsThisMonth,
                    trialCount: orgs.filter((o) => o.license_plan === "trial").length,
                    paidCount: orgs.filter(
                        (o) => o.license_plan !== "trial" && o.active !== false,
                    ).length,
                },
                planBreakdown,
                alerts: alerts.slice(0, 12),
                topByUsers,
                recentOrganizations,
                plans,
                generatedAt: new Date().toISOString(),
            }),
        };
    } catch (error) {
        console.error("getPlatformDashboardAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar dashboard" };
    }
}

export async function listPlatformOrganizationsAction(): Promise<{
    success: boolean;
    data?: OrganizationListItem[];
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const data = await loadAllOrganizations(db);
        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listPlatformOrganizationsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar organizações" };
    }
}

export async function createPlatformOrganizationAction(input: {
    name: string;
    slug?: string;
    max_users?: number;
    license_plan?: TenantLicensePlan;
    license_expires_at?: string;
}): Promise<{ success: boolean; data?: Tenant; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const name = input.name?.trim();
    if (!name) return { success: false, error: "Nome é obrigatório" };

    const slug = slugify(input.slug?.trim() || name);
    if (!slug) return { success: false, error: "Slug inválido" };

    const db = await getDb();
    try {
        const dup = await db.query<[unknown[]]>(
            "SELECT id FROM tenant WHERE slug = $slug AND deleted_at IS NONE LIMIT 1",
            { slug },
        );
        if ((dup[0]?.length ?? 0) > 0) {
            return { success: false, error: "Slug já em uso" };
        }

        const plan = input.license_plan ?? "standard";
        const maxUsers =
            input.max_users != null && input.max_users > 0 ? Math.floor(input.max_users) : 10;

        let licenseExpires = input.license_expires_at?.trim() || null;
        if (!licenseExpires && plan === "trial") {
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 14);
            licenseExpires = trialEnd.toISOString();
        }

        const created = await db.create(new Table("tenant")).content({
            name,
            slug,
            subdomain: slug,
            active: true,
            max_users: maxUsers,
            license_plan: plan,
            license_expires_at: licenseExpires,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const row = Array.isArray(created) ? created[0] : created;

        await db.create(new Table("proposal_settings")).content({
            tenant_id: tenantRecordId(String(row.id)),
            company_name: name,
            primary_color: BRAND_DEFAULT_PRIMARY,
            secondary_color: BRAND_DEFAULT_SECONDARY,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });

        revalidatePath("/platform");
        revalidatePath("/platform/organizations");
        return { success: true, data: toPlain(serializeTenant(row as Record<string, unknown>)) };
    } catch (error) {
        console.error("createPlatformOrganizationAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao criar organização" };
    }
}

export async function updatePlatformOrganizationAction(input: {
    tenantId: string;
    name?: string;
    slug?: string;
    active?: boolean;
    max_users?: number | null;
    license_plan?: TenantLicensePlan;
    license_expires_at?: string | null;
}): Promise<{ success: boolean; data?: Tenant; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const tenantId = input.tenantId?.trim();
    if (!tenantId) return { success: false, error: "Organização inválida" };

    const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (input.name !== undefined) {
        const name = input.name.trim();
        if (!name) return { success: false, error: "Nome é obrigatório" };
        patch.name = name;
    }
    if (input.slug !== undefined) {
        const slug = slugify(input.slug);
        if (!slug) return { success: false, error: "Slug inválido" };
        patch.slug = slug;
    }
    if (input.active !== undefined) patch.active = Boolean(input.active);
    if (input.max_users !== undefined) {
        patch.max_users =
            input.max_users != null && input.max_users > 0
                ? Math.floor(input.max_users)
                : null;
    }
    if (input.license_plan !== undefined) patch.license_plan = input.license_plan;
    if (input.license_expires_at !== undefined) {
        patch.license_expires_at = input.license_expires_at?.trim() || null;
    }

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantId);
        const canonicalId = recordIdToString(rid)!;
        await db.update(rid).merge(patch);
        const raw = await db.select<Record<string, unknown>>(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Organização não encontrada" };

        revalidatePath("/platform");
        revalidatePath("/platform/organizations");
        revalidatePath(`/platform/organizations/${String(row.slug ?? canonicalId)}`);
        return { success: true, data: toPlain(serializeTenant(row)) };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updatePlatformOrganizationAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao atualizar organização" };
    }
}

export async function getPlatformOrganizationAction(tenantId: string): Promise<{
    success: boolean;
    data?: OrganizationListItem & { branding: ProposalSettings | null };
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantId);
        const canonicalId = recordIdToString(rid)!;
        const raw = await db.select<Record<string, unknown>>(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        if (!row) return { success: false, error: "Organização não encontrada" };

        const member_count = await countActiveTenantMembers(canonicalId, db);
        const settingsRows = await db.query<[ProposalSettings[]]>(
            "SELECT * FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1",
            { tenantId: tenantRecordId(canonicalId) },
        );
        const branding = settingsRows[0]?.[0] ?? null;

        return {
            success: true,
            data: toPlain({
                ...serializeTenant(row),
                member_count,
                branding,
            }),
        };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("getPlatformOrganizationAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar organização" };
    }
}

export async function updatePlatformOrganizationBrandingAction(
    tenantId: string,
    input: {
        company_name?: string;
        company_logo_url?: string;
        primary_color?: string;
        secondary_color?: string;
        app_public_url?: string;
    },
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantId);
        const canonicalId = recordIdToString(rid)!;
        const patch: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
        };
        if (input.company_name !== undefined) patch.company_name = input.company_name.trim();
        if (input.company_logo_url !== undefined) {
            patch.company_logo_url = input.company_logo_url.trim() || null;
        }
        if (input.primary_color !== undefined) {
            patch.primary_color =
                normalizeHex(input.primary_color) ?? BRAND_DEFAULT_PRIMARY;
        }
        if (input.secondary_color !== undefined) {
            patch.secondary_color =
                normalizeHex(input.secondary_color) ?? BRAND_DEFAULT_SECONDARY;
        }
        if (input.app_public_url !== undefined) {
            patch.app_public_url = input.app_public_url.trim() || null;
        }

        const existing = await db.query<[Array<{ id: unknown }>]>(
            "SELECT id FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1",
            { tenantId: tenantRecordId(canonicalId) },
        );
        const settingsId = recordIdToString(existing[0]?.[0]?.id);

        if (settingsId) {
            await db.update(requireRecordId("proposal_settings", settingsId)).merge(patch);
        } else {
            await db.create(new Table("proposal_settings")).content({
                tenant_id: tenantRecordId(canonicalId),
                ...patch,
                created_at: new Date().toISOString(),
            });
        }

        const slugRow = await db.select<{ slug?: string }>(rid);
        const slugRec = Array.isArray(slugRow) ? slugRow[0] : slugRow;
        revalidatePath(`/platform/organizations/${String(slugRec?.slug ?? canonicalId)}`);
        return { success: true };
    } catch (error) {
        if (error instanceof InvalidRecordIdError) {
            return { success: false, error: error.message };
        }
        console.error("updatePlatformOrganizationBrandingAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar customização" };
    }
}

export async function deactivatePlatformOrganizationAction(
    tenantId: string,
): Promise<{ success: boolean; error?: string }> {
    return updatePlatformOrganizationAction({ tenantId, active: false });
}

export async function reactivatePlatformOrganizationAction(
    tenantId: string,
): Promise<{ success: boolean; error?: string }> {
    return updatePlatformOrganizationAction({ tenantId, active: true });
}

export type PlatformOrganizationMetrics = {
    member_count: number;
    budget_count: number;
    client_count: number;
};

export async function getPlatformOrganizationMetricsAction(tenantRef: string): Promise<{
    success: boolean;
    data?: PlatformOrganizationMetrics;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;
        const member_count = await countActiveTenantMembers(tenantId, db);

        const [budgetRows, clientRows] = await Promise.all([
            db.query<[Array<{ count: number }>]>(
                "SELECT count() AS count FROM budget WHERE tenant_id = $tenantId GROUP ALL",
                { tenantId: tenantRecordId(tenantId) },
            ),
            db.query<[Array<{ count: number }>]>(
                "SELECT count() AS count FROM client WHERE tenant_id = $tenantId GROUP ALL",
                { tenantId: tenantRecordId(tenantId) },
            ),
        ]);

        return {
            success: true,
            data: toPlain({
                member_count,
                budget_count: Number(budgetRows[0]?.[0]?.count ?? 0),
                client_count: Number(clientRows[0]?.[0]?.count ?? 0),
            }),
        };
    } catch (error) {
        console.error("getPlatformOrganizationMetricsAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao carregar métricas" };
    }
}

export async function listOrgMembersForPlatformAction(tenantRef: string): Promise<{
    success: boolean;
    data?: Array<{
        email: string;
        role: string;
        active: boolean;
        pending_setup: boolean;
    }>;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const tenantId = recordIdToString(rid)!;

        const rows = await db.query<
            [
                Array<{
                    role?: string;
                    user_id?: { email?: string; active?: boolean; password_hash?: string };
                }>,
            ]
        >(
            "SELECT role, user_id FROM portal_user_tenant WHERE tenant_id = $tenantId FETCH user_id",
            { tenantId: tenantRecordId(tenantId) },
        );

        const data = (rows[0] ?? [])
            .map((row) => {
                const email = row.user_id?.email;
                if (!email) return null;
                return {
                    email: String(email),
                    role: String(row.role ?? "user"),
                    active: row.user_id?.active !== false,
                    pending_setup: !passwordHashLooksValid(row.user_id?.password_hash),
                };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

        return { success: true, data: toPlain(data) };
    } catch (error) {
        console.error("listOrgMembersForPlatformAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao listar usuários" };
    }
}

export async function exportPlatformOrganizationsCsvAction(): Promise<{
    success: boolean;
    data?: string;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const [orgs, plans] = await Promise.all([loadAllOrganizations(db), loadPlatformPlans()]);
        const header =
            "nome,slug,plano,ativa,usuarios,max_usuarios,mrr_brl,vencimento,subdominio,url_publica";
        const lines = orgs.map((org) => {
            const plan = org.license_plan ?? "standard";
            const mrr = org.active !== false ? planMonthlyPrice(plan, plans) : 0;
            const exp = org.license_expires_at?.slice(0, 10) ?? "";
            const sub = org.subdomain ?? org.slug;
            const url = getTenantPublicOrigin(org);
            const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
            return [
                esc(org.name),
                esc(org.slug),
                plan,
                org.active !== false ? "sim" : "nao",
                String(org.member_count),
                org.max_users != null ? String(org.max_users) : "",
                String(mrr),
                exp,
                esc(sub),
                esc(url),
            ].join(",");
        });
        return { success: true, data: [header, ...lines].join("\n") };
    } catch (error) {
        console.error("exportPlatformOrganizationsCsvAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao exportar CSV" };
    }
}

export async function updateTenantSubdomainAction(
    tenantRef: string,
    subdomain: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const sub = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!sub || RESERVED_SUBDOMAINS.has(sub)) {
        return { success: false, error: "Subdomínio inválido ou reservado" };
    }

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const dup = await db.query<[unknown[]]>(
            `SELECT id FROM tenant WHERE (subdomain = $sub OR slug = $sub) AND id != $id AND deleted_at IS NONE LIMIT 1`,
            { sub, id: rid },
        );
        if ((dup[0]?.length ?? 0) > 0) {
            return { success: false, error: "Subdomínio já em uso" };
        }

        await db.update(rid).merge({ subdomain: sub, updated_at: new Date().toISOString() });
        revalidatePath("/platform/organizations");
        return { success: true };
    } catch (error) {
        console.error("updateTenantSubdomainAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar subdomínio" };
    }
}

export async function setCustomDomainAction(
    tenantRef: string,
    domain: string,
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const custom = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] ?? "";
    if (!custom || !custom.includes(".")) {
        return { success: false, error: "Domínio inválido" };
    }

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        await db.update(rid).merge({
            custom_domain: custom,
            custom_domain_verified_at: null,
            updated_at: new Date().toISOString(),
        });
        revalidatePath("/platform/organizations");
        return { success: true };
    } catch (error) {
        console.error("setCustomDomainAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao salvar domínio" };
    }
}

export async function verifyCustomDomainAction(tenantRef: string): Promise<{
    success: boolean;
    verified?: boolean;
    error?: string;
}> {
    const auth = await assertPlatformMasterSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const rid = await resolveTenantRef(db, tenantRef);
        const raw = await db.select<Record<string, unknown>>(rid);
        const row = Array.isArray(raw) ? raw[0] : raw;
        const domain = String(row?.custom_domain ?? "").trim().toLowerCase();
        if (!domain) return { success: false, error: "Nenhum domínio cadastrado" };

        const tenant = serializeTenant(row!);
        const sub = tenant.subdomain ?? tenant.slug;
        const tenantDomain = process.env.APP_TENANT_DOMAIN?.trim() || process.env.APP_PRIMARY_HOST?.trim();
        const expected = tenantDomain ? `${sub}.${tenantDomain}`.toLowerCase() : null;

        let verified = false;
        if (expected) {
            try {
                const dns = await import("node:dns/promises");
                const cnames = await dns.resolveCname(domain);
                verified = cnames.some((c) => c.toLowerCase() === expected || c.toLowerCase().endsWith(`.${expected}`));
            } catch {
                verified = false;
            }
        }

        if (verified) {
            await db.update(rid).merge({
                custom_domain_verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        return { success: true, verified };
    } catch (error) {
        console.error("verifyCustomDomainAction:", error);
        if (isTokenExpiredError(error)) resetDb();
        return { success: false, error: "Erro ao verificar DNS" };
    }
}

export async function assertTenantOperationalForInvite(tenantId: string): Promise<string | null> {
    const db = await getDb();
    const rows = await db.query<[Array<{ active?: boolean; license_expires_at?: string | null }>]>(
        "SELECT active, license_expires_at FROM tenant WHERE id = $id LIMIT 1",
        { id: new StringRecordId(tenantId) },
    );
    const row = rows[0]?.[0];
    if (!row) return "Organização não encontrada";
    const block = getTenantAccessBlockReason({
        active: row.active !== false,
        license_expires_at: row.license_expires_at ?? null,
    });
    if (block === "inactive") return "Organização desativada — convites bloqueados";
    if (block === "expired") return "Licença expirada — convites bloqueados";
    return null;
}
