import {
    listPlatformAdminCandidatesAction,
    listPlatformAdminsAction,
} from "@/actions/platform-admin-actions";
import { PlatformAdminsManagement } from "@/components/platform/platform-admins-management";

export default async function PlatformAdminsPage() {
    const [adminsRes, candidatesRes] = await Promise.all([
        listPlatformAdminsAction(),
        listPlatformAdminCandidatesAction(),
    ]);
    const admins = adminsRes.success ? (adminsRes.data ?? []) : [];
    const candidates = candidatesRes.success ? (candidatesRes.data ?? []) : [];

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-8">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Admins da plataforma</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Gerencie quem pode acessar o painel de revenda. Promova usuários já cadastrados no
                    portal — sem convite por e-mail.
                </p>
            </div>
            <PlatformAdminsManagement initialAdmins={admins} initialCandidates={candidates} />
        </div>
    );
}
