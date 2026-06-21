import type { Metadata } from "next";
import { listPlatformTeamAction } from "@/actions/platform-team-actions";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PageErrorAlert } from "@/components/layout/page-error-alert";
import { PlatformTeamManagement } from "@/components/platform/platform-team-management";

export const metadata: Metadata = {
    title: "Equipe da plataforma",
};

export default async function PlatformTeamPage() {
    const res = await listPlatformTeamAction();
    const members = res.success ? (res.data ?? []) : [];

    return (
        <PlatformPageShell
            eyebrow="Revenda"
            title="Equipe da plataforma"
            description="Gerencie quem acessa o painel de revenda. É a mesma conta do login — quem já usa uma empresa pode também ter acesso à plataforma."
            maxWidth="4xl"
        >
            {!res.success ? (
                <PageErrorAlert message={res.error ?? "Erro ao carregar equipe."} />
            ) : null}
            <PlatformTeamManagement initialMembers={members} />
        </PlatformPageShell>
    );
}
