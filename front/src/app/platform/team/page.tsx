import { listPlatformTeamAction } from "@/actions/platform-team-actions";
import { PlatformTeamManagement } from "@/components/platform/platform-team-management";

export default async function PlatformTeamPage() {
    const res = await listPlatformTeamAction();
    const members = res.success ? (res.data ?? []) : [];

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Equipe da plataforma</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Gerencie quem acessa o painel de revenda. É a mesma conta do login — quem já
                    usa uma empresa pode também ter acesso à plataforma.
                </p>
            </div>
            {!res.success && (
                <p className="text-sm text-destructive">{res.error ?? "Erro ao carregar equipe."}</p>
            )}
            <PlatformTeamManagement initialMembers={members} />
        </div>
    );
}
