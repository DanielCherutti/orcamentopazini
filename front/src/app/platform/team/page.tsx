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
            eyebrow="Acesso"
            title="Equipe"
            description="Quem administra o EngHub — mesma conta do login."
            maxWidth="5xl"
        >
            {!res.success ? (
                <PageErrorAlert message={res.error ?? "Erro ao carregar equipe."} />
            ) : null}
            <PlatformTeamManagement initialMembers={members} />
        </PlatformPageShell>
    );
}
