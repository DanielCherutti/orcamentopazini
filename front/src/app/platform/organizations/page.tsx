import type { Metadata } from "next";
import { listPlatformOrganizationsAction } from "@/actions/platform-actions";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { PlatformOrganizationsManagement } from "@/components/platform/platform-organizations-management";

export const metadata: Metadata = {
    title: "Organizações",
};

export default async function PlatformOrganizationsPage() {
    const list = await listPlatformOrganizationsAction();
    if (!list.success || !list.data) {
        return (
            <PlatformPageError
                pageTitle="Organizações"
                message={list.error ?? "Erro ao carregar organizações."}
                backLink={{ href: "/platform", label: "Dashboard" }}
            />
        );
    }

    return (
        <PlatformPageShell
            eyebrow="Revenda · Clientes"
            title="Organizações"
            description="Cadastro e gestão de empresas — licenças, limites e identidade visual."
            maxWidth="full"
            breadcrumbs={[
                { href: "/platform", label: "Mission Control" },
                { label: "Organizações" },
            ]}
        >
            <PlatformOrganizationsManagement initialOrganizations={list.data} />
        </PlatformPageShell>
    );
}
