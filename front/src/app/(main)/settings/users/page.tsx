import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionEmail } from "@/actions/auth-actions";
import { listPortalUsersAction } from "@/actions/portal-user-actions";
import { PortalUsersForm } from "@/components/settings/portal-users-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: "Usuários do sistema",
};

export default async function SettingsUsersPage() {
    const sessionEmail = await getSessionEmail();
    const list = await listPortalUsersAction();

    if (!list.success || !list.users) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <p className="text-destructive">
                    {list.error ?? "Não foi possível carregar os usuários."}
                </p>
                <Link href="/settings" className="text-primary underline mt-4 inline-block">
                    Voltar às configurações
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto p-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <Button variant="ghost" size="sm" className="-ml-2 h-8 px-2" asChild>
                        <Link href="/settings">
                            <ArrowLeft className="size-4" />
                            Configurações gerais
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Usuários do sistema
                    </h1>
                    <p className="text-sm text-muted-foreground max-w-xl">
                        Novos acessos: envie só o e-mail — a pessoa recebe um link para criar a
                        senha. Configure a URL pública e o SMTP em{" "}
                        <Link href="/settings" className="text-primary font-medium hover:underline">
                            Configurações da empresa
                        </Link>{" "}
                        (seção E-mail / convites). Use a lista para ativar, inativar ou definir senha
                        manualmente.
                    </p>
                </div>
            </div>
            <PortalUsersForm
                users={list.users}
                sessionEmail={sessionEmail}
            />
        </div>
    );
}
