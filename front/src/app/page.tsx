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
            aside={<LoginHighlightsCard className="w-full max-w-[440px] lg:max-w-none" />}
            footer={
                <p className="text-center text-xs text-muted-foreground text-balance">
                    {branding.company_name} · Acesso restrito a usuários autorizados
                </p>
            }
        >
            <div className="space-y-4">
                {success === "invite" && (
                    <Alert className="rounded-xl border-green-500/35 bg-green-500/10 text-green-950 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-50">
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <AlertTitle className="text-green-950 dark:text-green-50">Senha criada</AlertTitle>
                        <AlertDescription className="text-green-900/90 dark:text-green-100/90">
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
                        className="rounded-xl border-amber-500/35 bg-amber-500/10 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50"
                        role="alert"
                    >
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <AlertTitle className="text-amber-950 dark:text-amber-50">
                            Conta ainda não ativada
                        </AlertTitle>
                        <AlertDescription className="text-amber-900/90 dark:text-amber-100/90 space-y-2">
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
                    <Alert
                        className="rounded-xl border-amber-500/35 bg-amber-500/10 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-50"
                        role="alert"
                    >
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <AlertTitle className="text-amber-950 dark:text-amber-50">
                            Configuração necessária
                        </AlertTitle>
                        <AlertDescription className="space-y-2 text-amber-900/90 dark:text-amber-100/90">
                            <p>
                                Defina <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">JWT_SECRET</code>{" "}
                                (mín. 32 caracteres) no{" "}
                                <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">.env</code>.
                            </p>
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            <form action={loginAction} className="mt-8 space-y-5">
                <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
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
                            className="h-11 rounded-xl border-border/80 bg-muted/30 pl-10 shadow-inner transition-colors focus-visible:bg-background"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
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
                            className="h-11 rounded-xl border-border/80 bg-muted/30 pl-10 shadow-inner transition-colors focus-visible:bg-background"
                        />
                    </div>
                </div>

                <Button
                    type="submit"
                    size="lg"
                    className="mt-2 w-full rounded-xl text-base font-semibold shadow-md"
                >
                    Entrar
                </Button>
            </form>
        </AuthLayout>
    );
}
