import type { Metadata } from "next";
import Link from "next/link";
import { CompleteInviteForm } from "@/components/auth/complete-invite-form";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { brandingCSSProperties } from "@/lib/branding-theme";
import { buildHostPageMetadata, getHostDisplayBranding, loginSubtitleForBranding } from "@/lib/host-branding";
import { AlertCircle } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
    return buildHostPageMetadata("Criar senha");
}

export default async function ConvitePage({
    searchParams,
}: {
    searchParams: Promise<{ token?: string }>;
}) {
    const { token } = await searchParams;
    const raw = token?.trim() ?? "";
    const validToken = raw.length >= 32;
    const branding = await getHostDisplayBranding();
    const themeStyle = brandingCSSProperties(branding.primary_color, branding.secondary_color);
    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <div className="min-h-dvh flex items-center justify-center p-4 bg-muted/30" style={themeStyle}>
            <Card className="w-full max-w-md shadow-lg">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-3 flex flex-col items-center gap-2">
                        <DashboardWelcomeLogo logoUrl={logoUrl} alt="" />
                        <p className="text-lg font-semibold">{branding.company_name}</p>
                        <p className="text-sm text-muted-foreground">
                            {loginSubtitleForBranding(branding)}
                        </p>
                    </div>
                    <CardTitle>Criar sua senha</CardTitle>
                    <CardDescription>
                        Defina uma senha forte para acessar o portal. Depois você
                        poderá entrar na tela inicial com e-mail e senha.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!validToken ? (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Link inválido</AlertTitle>
                            <AlertDescription className="space-y-2">
                                <p>
                                    Abra o link completo enviado por e-mail ou peça
                                    um novo convite ao administrador.
                                </p>
                                <Link
                                    href="/"
                                    className="text-sm font-medium underline underline-offset-4"
                                >
                                    Voltar ao login
                                </Link>
                            </AlertDescription>
                        </Alert>
                    ) : (
                        <CompleteInviteForm token={raw} />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
