import type { Metadata } from "next";
import { SelectTenantForm } from "@/components/tenant/select-tenant-form";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { brandingCSSProperties } from "@/lib/branding-theme";
import { buildHostPageMetadata, getHostDisplayBranding, loginSubtitleForBranding } from "@/lib/host-branding";

export async function generateMetadata(): Promise<Metadata> {
    return buildHostPageMetadata("Selecionar organização");
}

export default async function SelectTenantPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const params = await searchParams;
    const branding = await getHostDisplayBranding();
    const themeStyle = brandingCSSProperties(branding.primary_color, branding.secondary_color);
    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <div
            className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-muted/40 to-background p-6"
            style={themeStyle}
        >
            {!branding.isProductHost && (
                <div className="flex flex-col items-center gap-2 text-center">
                    <DashboardWelcomeLogo logoUrl={logoUrl} alt="" />
                    <p className="text-lg font-semibold">{branding.company_name}</p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                        {loginSubtitleForBranding(branding)}
                    </p>
                </div>
            )}
            <SelectTenantForm errorCode={params.error ?? null} />
        </div>
    );
}
