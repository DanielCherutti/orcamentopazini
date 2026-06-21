import { redirect } from "next/navigation";
import { getSessionEmail } from "@/actions/auth-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { LayoutShell } from "@/components/layout/layout-shell";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { MainAppProviders } from "@/components/providers/main-app-providers";
import { brandingCSSProperties } from "@/lib/branding-theme";
import { getSessionContext } from "@/lib/tenant-context";
import { SupportModeBanner } from "@/components/platform/support-mode-banner";
import { SupportModeLayoutProvider } from "@/components/platform/support-mode-layout-provider";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const ctx = await getSessionContext();
    if (ctx?.platformMode && !ctx.impersonation) {
        redirect("/platform");
    }

    const impersonation = ctx?.impersonation;

    const [sessionEmail, settings] = await Promise.all([
        getSessionEmail(),
        getProposalSettingsAction(),
    ]);
    const themeStyle = brandingCSSProperties(
        settings.success ? settings.data?.primary_color : null,
        settings.success ? settings.data?.secondary_color : null
    );

    return (
        <div className="min-h-screen flex flex-col" style={themeStyle}>
            <SupportModeLayoutProvider
                active={Boolean(impersonation)}
                banner={
                    impersonation ? (
                        <SupportModeBanner
                            tenantName={
                                settings.success
                                    ? (settings.data?.company_name ?? impersonation.tenantSlug)
                                    : impersonation.tenantSlug
                            }
                            tenantSlug={impersonation.tenantSlug}
                            adminEmail={ctx!.email}
                            expiresAt={impersonation.expiresAt}
                            mode={impersonation.mode}
                        />
                    ) : null
                }
            >
                <MainAppProviders>
                    <SidebarProvider>
                        <LayoutShell sessionEmail={sessionEmail}>
                            {children}
                        </LayoutShell>
                    </SidebarProvider>
                </MainAppProviders>
            </SupportModeLayoutProvider>
        </div>
    );
}
