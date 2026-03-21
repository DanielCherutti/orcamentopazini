import type { Metadata } from "next";
import Link from "next/link";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
    title: "Configurações",
};

export default async function SettingsPage() {
    const { data: settings } = await getProposalSettingsAction();

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex flex-wrap gap-4 justify-end">
                <Link
                    href="/settings/users"
                    className="text-sm font-medium text-primary hover:underline"
                >
                    Gerenciar usuários do sistema →
                </Link>
            </div>
            <SettingsForm initialSettings={settings || {}} />
        </div>
    );
}
