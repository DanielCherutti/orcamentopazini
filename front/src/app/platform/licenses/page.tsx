import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlatformLicenseSettingsAction } from "@/actions/platform-license-actions";
import { PlatformLicensesForm } from "@/components/platform/platform-licenses-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
    title: "Planos e preços",
};

export default async function PlatformLicensesPage() {
    const settings = await getPlatformLicenseSettingsAction();

    if (!settings.success || !settings.data) {
        return (
            <div className="p-8">
                <p className="text-destructive">
                    {settings.error ?? "Erro ao carregar planos."}
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
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
                        Revenda
                    </p>
                    <h1 className="text-3xl font-bold tracking-tight">Planos e preços</h1>
                    <p className="max-w-2xl text-muted-foreground">
                        Configure valores mensais, limites sugeridos de usuários e textos exibidos
                        no dashboard comercial e ao criar novas organizações.
                    </p>
                </div>
            </header>

            <PlatformLicensesForm
                initialForm={settings.data.form}
                updatedAt={settings.data.updatedAt}
            />
        </div>
    );
}
