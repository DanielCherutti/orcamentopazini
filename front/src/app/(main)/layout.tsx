import { getSessionEmail } from "@/actions/auth-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { LayoutShell } from "@/components/layout/layout-shell";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { MainAppProviders } from "@/components/providers/main-app-providers";
import { brandingCSSProperties } from "@/lib/branding-theme";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sessionEmail, settings] = await Promise.all([
        getSessionEmail(),
        getProposalSettingsAction(),
    ]);

    const themeStyle = brandingCSSProperties(
        settings.success ? settings.data?.primary_color : null,
        settings.success ? settings.data?.secondary_color : null
    );

    return (
        <div className="min-h-screen" style={themeStyle}>
            <MainAppProviders>
                <SidebarProvider>
                    <LayoutShell sessionEmail={sessionEmail}>{children}</LayoutShell>
                </SidebarProvider>
            </MainAppProviders>
        </div>
    );
}
