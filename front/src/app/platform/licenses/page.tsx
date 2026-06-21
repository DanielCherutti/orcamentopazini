import type { Metadata } from "next";
import { getPlatformLicenseSettingsAction } from "@/actions/platform-license-actions";
import { getPlatformAsaasSettingsAction } from "@/actions/platform-billing-settings-actions";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { PlatformAsaasSettingsForm } from "@/components/platform/platform-asaas-settings-form";
import { PlatformLicensesForm } from "@/components/platform/platform-licenses-form";

export const metadata: Metadata = {
    title: "Planos e preços",
};

export default async function PlatformLicensesPage() {
    const [settings, asaas] = await Promise.all([
        getPlatformLicenseSettingsAction(),
        getPlatformAsaasSettingsAction(),
    ]);

    if (!settings.success || !settings.data) {
        return (
            <PlatformPageError
                pageTitle="Planos e preços"
                message={settings.error ?? "Erro ao carregar planos."}
                backLink={{ href: "/platform", label: "Dashboard" }}
            />
        );
    }

    return (
        <PlatformPageShell
            eyebrow="Monetização"
            title="Planos e preços"
            description="Valores mensais, limites de usuários e textos do dashboard comercial."
            maxWidth="full"
            tone="emerald"
        >
            <div className="space-y-8">
                <PlatformLicensesForm
                    initialForm={settings.data.form}
                    updatedAt={settings.data.updatedAt}
                />
                {asaas.success && asaas.data && (
                    <PlatformAsaasSettingsForm initial={asaas.data} />
                )}
            </div>
        </PlatformPageShell>
    );
}
