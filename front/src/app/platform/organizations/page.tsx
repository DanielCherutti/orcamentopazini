import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listPlatformOrganizationsAction } from "@/actions/platform-actions";
import { PlatformOrganizationsManagement } from "@/components/platform/platform-organizations-management";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: "Organizações",
};

export default async function PlatformOrganizationsPage() {
    const list = await listPlatformOrganizationsAction();
    if (!list.success || !list.data) {
        return (
            <div className="p-8">
                <p className="text-destructive">
                    {list.error ?? "Erro ao carregar organizações."}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 p-8">
            <header className="space-y-4">
                <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground" asChild>
                    <Link href="/platform">
                        <ArrowLeft className="size-4" />
                        Dashboard
                    </Link>
                </Button>
                <div className="space-y-1">
                    <h1 className="text-3xl font-bold tracking-tight">Organizações</h1>
                    <p className="max-w-2xl text-muted-foreground">
                        Cadastro e gestão de empresas clientes — licenças, limites e identidade
                        visual.
                    </p>
                </div>
            </header>
            <PlatformOrganizationsManagement initialOrganizations={list.data} />
        </div>
    );
}
