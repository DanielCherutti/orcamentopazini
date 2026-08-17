import type { Metadata } from "next";
import { loginAction } from "@/actions/auth-actions";
import { AuthLayout } from "@/components/auth/auth-layout";
import { LoginHighlightsCard } from "@/components/auth/login-highlights-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getHostDisplayBranding, loginSubtitleForBranding, buildHostPageMetadata } from "@/lib/host-branding";
import { AlertCircle, CheckCircle2, Lock, Mail } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
    return buildHostPageMetadata("Entrar");
}

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; success?: string }>;
}) {
    const { error, success } = await searchParams;
    const branding = await getHostDisplayBranding();
    const loginSubtitle = loginSubtitleForBranding(branding);
    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <AuthLayout
            branding={branding}
            logoUrl={logoUrl}
            subtitle={loginSubtitle}
            aside={<LoginHighlightsCard />}
            footer={
                <p className="text-center text-xs text-balance">
                    {branding.company_name} · Acesso restrito a usuários autorizados
                </p>
            }
        >
            <div className="space-y-4">
                {success === "invite" && (
                    <Alert className="rounded-lg border-emerald-300 bg-emerald-50 text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <AlertTitle className="text-emerald-900">Senha criada</AlertTitle>
                        <AlertDescription className="text-emerald-800">
                            Agora você pode entrar com seu e-mail e a nova senha.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "no_tenant" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Sem organização</AlertTitle>
                        <AlertDescription>
                            Sua conta não está vinculada a nenhuma organização. Peça ao administrador
                            para liberar o acesso.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "invalid" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Falha no acesso</AlertTitle>
                        <AlertDescription>Email ou senha incorretos.</AlertDescription>
                    </Alert>
                )}

                {error === "pending" && (
                    <Alert
                        className="rounded-lg border-amber-300 bg-amber-50 text-amber-900"
                        role="alert"
                    >
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <AlertTitle className="text-amber-950">Conta ainda não ativada</AlertTitle>
                        <AlertDescription className="space-y-2 text-amber-900">
                            <p>
                                Use o link enviado por e-mail para criar sua senha. Se expirou ou não
                                recebeu, peça um novo convite ao administrador.
                            </p>
                        </AlertDescription>
                    </Alert>
                )}

                {error === "ratelimit" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Muitas tentativas</AlertTitle>
                        <AlertDescription>
                            Aguarde alguns minutos e tente novamente a partir deste endereço.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "expired" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Sessão encerrada</AlertTitle>
                        <AlertDescription>Faça login novamente para continuar.</AlertDescription>
                    </Alert>
                )}

                {error === "org_inactive" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Organização desativada</AlertTitle>
                        <AlertDescription>
                            Esta organização está desativada. Contate o suporte da plataforma.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "license_expired" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Licença expirada</AlertTitle>
                        <AlertDescription>
                            A licença desta organização expirou. Contate o suporte para renovar.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "host_mismatch" && (
                    <Alert variant="destructive" className="rounded-xl border-destructive/40">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Endereço incorreto</AlertTitle>
                        <AlertDescription>
                            Sua sessão não corresponde a esta organização. Faça login neste endereço.
                        </AlertDescription>
                    </Alert>
                )}

                {error === "config" && (
                    <Alert className="rounded-lg border-amber-300 bg-amber-50 text-amber-900" role="alert">
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <AlertTitle className="text-amber-950">Configuração necessária</AlertTitle>
                        <AlertDescription className="space-y-2 text-amber-900">
                            <p>
                                Defina{" "}
                                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">JWT_SECRET</code> (mín. 32
                                caracteres) no{" "}
                                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">.env</code>.
                            </p>
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            <form action={loginAction} className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="email" className="auth-label text-sm">
                        Email
                    </Label>
                    <div className="relative">
                        <Mail
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            placeholder="seu@email.com"
                            required
                            className="auth-input h-11 rounded-xl pl-10"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password" className="auth-label text-sm">
                        Senha
                    </Label>
                    <div className="relative">
                        <Lock
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden
                        />
                        <Input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            required
                            className="auth-input h-11 rounded-xl pl-10"
                        />
                    </div>
                </div>

                <Button type="submit" size="lg" className="auth-submit-btn mt-1 w-full rounded-lg">
                    Entrar
                </Button>
            </form>
        </AuthLayout>
    );
}
