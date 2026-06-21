import type { Metadata } from "next";
import { getSessionEmail } from "@/actions/auth-actions";
import { listPortalUsersAction, getPortalAdminCapabilitiesAction } from "@/actions/portal-user-actions";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { TenantPageError } from "@/components/layout/page-error-alert";
import { PortalUsersForm } from "@/components/settings/portal-users-form";

export const metadata: Metadata = {
    title: "Usuários do sistema",
};

export default async function SettingsUsersPage() {
    const [sessionEmail, list, caps] = await Promise.all([
        getSessionEmail(),
        listPortalUsersAction(),
        getPortalAdminCapabilitiesAction(),
    ]);

    if (!list.success || !list.users) {
        return (
            <TenantPageError
                pageTitle="Usuários do sistema"
                message={list.error ?? caps.error ?? "Não foi possível carregar os usuários."}
                backLink={{ href: "/settings", label: "Configurações" }}
            />
        );
    }

    return (
        <DashboardPageShell
            title="Usuários do sistema"
            description="Convites e acessos são por organização (tenant ativo no header). Configure SMTP em Configurações da empresa."
            backLink={{ href: "/settings", label: "Configurações" }}
            maxWidth="5xl"
        >
            <PortalUsersForm
                users={list.users}
                sessionEmail={sessionEmail}
                tenantName={caps.data?.tenantName}
            />
        </DashboardPageShell>
    );
}
