import type { Metadata } from "next";
import Link from "next/link";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { SettingsForm } from "@/components/settings/settings-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: "Configurações",
};

export default async function SettingsPage() {
    const { data: settings } = await getProposalSettingsAction();

    return (
        <DashboardPageShell
            title="Configurações"
            description="Identidade visual, textos das propostas e envio de e-mail (convites de usuário)."
            action={
                <>
                    <Button variant="outline" size="sm" className="h-9" asChild>
                        <Link href="/settings/audit">Auditoria</Link>
                    </Button>
                    <Button variant="outline" size="sm" className="h-9" asChild>
                        <Link href="/settings/users">Usuários</Link>
                    </Button>
                </>
            }
        >
            <SettingsForm initialSettings={settings || {}} />
        </DashboardPageShell>
    );
}
