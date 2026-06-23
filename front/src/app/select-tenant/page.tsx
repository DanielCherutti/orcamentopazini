import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SelectTenantForm } from "@/components/tenant/select-tenant-form";
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
    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <AuthLayout
            branding={branding}
            logoUrl={logoUrl}
            subtitle={loginSubtitleForBranding(branding)}
        >
            <SelectTenantForm errorCode={params.error ?? null} embedded />
        </AuthLayout>
    );
}
