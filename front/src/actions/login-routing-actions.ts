"use server";

import { redirect } from "next/navigation";

import { setPlatformSession } from "@/lib/tenant-context";
import { getPlatformRoleForEmail } from "@/lib/platform-user";
import {
    getUserMembershipsIncludingBlocked,
} from "@/actions/tenant-actions";
import type { TenantMembership } from "@/types/tenant-types";
import { setSessionContext } from "@/lib/tenant-context";
import type { PlatformRole } from "@/types/platform-types";

const SESSION_MAX_AGE = 60 * 60 * 8;

export type LoginDestination = {
    tenants: TenantMembership[];
    platformRole: PlatformRole | null;
};

/** Destinos disponíveis após login (empresas + plataforma, se houver). */
export async function getLoginDestinationsAction(): Promise<{
    success: boolean;
    data?: LoginDestination;
    error?: string;
}> {
    const { assertAuthenticatedSession } = await import("@/lib/tenant-context");
    const auth = await assertAuthenticatedSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const [platformRole, { valid: tenants }] = await Promise.all([
        getPlatformRoleForEmail(auth.ctx.email),
        getUserMembershipsIncludingBlocked(auth.ctx.email),
    ]);

    return {
        success: true,
        data: { tenants, platformRole },
    };
}

/** Indica se a sessão autenticada tem acesso ao painel /platform. */
export async function hasPlatformAccessAction(): Promise<boolean> {
    const { assertAuthenticatedSession } = await import("@/lib/tenant-context");
    const auth = await assertAuthenticatedSession();
    if (!auth.ok) return false;
    const role = await getPlatformRoleForEmail(auth.ctx.email);
    return role != null;
}

async function enterSingleTenant(email: string, membership: TenantMembership): Promise<string> {
    await setSessionContext(
        {
            email,
            tenantId: membership.tenantId,
            role: membership.role,
            pending: false,
            impersonation: null,
        },
        SESSION_MAX_AGE,
    );
    return "/dashboard";
}

/**
 * Login único: mesma conta, mesmo e-mail/senha.
 * Roteamento conforme vínculos (plataforma e/ou empresas).
 */
export async function resolveLoginRedirect(email: string): Promise<string> {
    const platformRole = await getPlatformRoleForEmail(email);
    const { valid: memberships, blockedReason } =
        await getUserMembershipsIncludingBlocked(email);

    const hasPlatform = platformRole != null;
    const hasOrgs = memberships.length > 0;

    if (!hasPlatform && !hasOrgs) {
        if (blockedReason) return `/?error=${blockedReason}`;
        return "/?error=no_tenant";
    }

    if (hasPlatform && !hasOrgs) {
        await setPlatformSession(email, platformRole);
        return "/platform";
    }

    if (!hasPlatform && hasOrgs) {
        if (memberships.length === 1) {
            return enterSingleTenant(email, memberships[0]!);
        }
        await setSessionContext({ email, pending: true, impersonation: null }, SESSION_MAX_AGE);
        return "/select-tenant";
    }

    // Plataforma + uma ou mais empresas → escolher destino (sempre)
    await setSessionContext({ email, pending: true, impersonation: null }, SESSION_MAX_AGE);
    return "/select-tenant";
}

export async function switchToPlatformAndRedirectAction() {
    const { getSessionContext } = await import("@/lib/tenant-context");
    const ctx = await getSessionContext();
    if (!ctx?.email) redirect("/");

    const role = await getPlatformRoleForEmail(ctx.email);
    if (!role) redirect("/dashboard");

    await setPlatformSession(ctx.email, role);
    redirect("/platform");
}

export async function exitPlatformToOrgPickerAction() {
    const { getSessionContext } = await import("@/lib/tenant-context");
    const { getUserMembershipsByEmail } = await import("@/actions/tenant-actions");
    const ctx = await getSessionContext();
    if (!ctx?.email) redirect("/");

    const memberships = await getUserMembershipsByEmail(ctx.email);
    if (memberships.length === 0) redirect("/platform");

    if (memberships.length === 1) {
        await setSessionContext(
            {
                email: ctx.email,
                tenantId: memberships[0]!.tenantId,
                role: memberships[0]!.role,
                pending: false,
                impersonation: null,
            },
            SESSION_MAX_AGE,
        );
        redirect("/dashboard");
    }

    await setSessionContext(
        { email: ctx.email, pending: true, impersonation: null },
        SESSION_MAX_AGE,
    );
    redirect("/select-tenant");
}
