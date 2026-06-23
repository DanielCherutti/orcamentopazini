import type { Metadata } from "next";
import Link from "next/link";
import { CompleteInviteForm } from "@/components/auth/complete-invite-form";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buildHostPageMetadata, getHostDisplayBranding } from "@/lib/host-branding";
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
    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <AuthLayout
            branding={branding}
            logoUrl={logoUrl}
            titleOverride="Criar sua senha"
            subtitle="Defina uma senha forte para acessar o portal. Depois você poderá entrar na tela inicial com e-mail e senha."
        >
            {!validToken ? (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Link inválido</AlertTitle>
                    <AlertDescription className="space-y-2">
                        <p>
                            Abra o link completo enviado por e-mail ou peça um novo convite ao
                            administrador.
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
        </AuthLayout>
    );
}
