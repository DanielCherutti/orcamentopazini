import type { Metadata } from "next";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
    title: "Configurações",
};

export default async function SettingsPage() {
    const { data: settings } = await getProposalSettingsAction();

    return (
        <div className="max-w-7xl mx-auto p-6">
            <SettingsForm initialSettings={settings || {}} />
        </div>
    );
}
