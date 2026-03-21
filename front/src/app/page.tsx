import type { Metadata } from "next";
import { loginAction } from "@/actions/auth-actions";
import { getPublicProposalBrandingAction } from "@/actions/settings-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoginHighlightsCard } from "@/components/auth/login-highlights-card";
import { DashboardWelcomeLogo } from "@/components/dashboard/dashboard-welcome-logo";
import { brandingCSSProperties } from "@/lib/branding-theme";
import { AlertCircle, Lock, Mail } from "lucide-react";

export const metadata: Metadata = {
    title: "Entrar",
};

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const { error } = await searchParams;
    const branding = await getPublicProposalBrandingAction();
    const themeStyle = brandingCSSProperties(branding.primary_color, branding.secondary_color);

    const envLogo = process.env.NEXT_PUBLIC_BRAND_LOGO_URL?.trim();
    const logoUrl = branding.company_logo_url || envLogo || null;

    return (
        <div
            className="relative min-h-dvh overflow-hidden bg-gradient-to-b from-primary/[0.07] via-background to-background"
            style={themeStyle}
        >
            {/* Decoração de fundo (cores das configurações) */}
            <div
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgb(var(--primary-rgb)/0.12),transparent)]"
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -right-32 top-1/4 h-96 w-96 rounded-full blur-3xl"
                style={{ backgroundColor: "rgb(var(--brand-secondary-rgb) / 0.06)" }}
                aria-hidden
            />
            <div
                className="pointer-events-none absolute -left-24 bottom-0 h-80 w-80 rounded-full bg-primary/[0.05] blur-3xl"
                aria-hidden
            />

            <main className="relative z-10 flex min-h-dvh flex-col items-center justify-center px-4 py-10 sm:px-6">
                <div className="grid w-full max-w-5xl grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] xl:max-w-6xl">
                    <div className="mx-auto w-full max-w-[440px] space-y-8 lg:mx-0">
                    <div
                        className="rounded-2xl border border-border/80 bg-card/95 p-8 shadow-[0_8px_40px_-12px_rgb(var(--primary-rgb)/0.18)] ring-1 ring-black/[0.04] backdrop-blur-sm dark:bg-card/90 dark:ring-white/[0.06] sm:p-10"
                    >
                        {/* Faixa da marca (cor secundária das configurações) */}
                        <div
                            className="mx-auto mb-6 h-1 w-14 rounded-full"
                            style={{
                                backgroundColor: "var(--brand-secondary)",
                                boxShadow: "0 0 20px rgb(var(--brand-secondary-rgb) / 0.45)",
                            }}
                            aria-hidden
                        />

                        <div className="flex flex-col items-center gap-4 text-center">
                            <DashboardWelcomeLogo logoUrl={logoUrl} alt="" />
                            <div className="min-w-0 space-y-1">
                                <h1 className="text-balance text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                                    {branding.company_name}
                                </h1>
                                <p className="text-sm text-muted-foreground">
                                    Sistema de gestão — entre com sua conta do portal
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 space-y-4">
                            {error === "invalid" && (
                                <Alert variant="destructive" className="rounded-xl border-destructive/40">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Falha no acesso</AlertTitle>
                                    <AlertDescription>Email ou senha incorretos.</AlertDescription>
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
                                        <p className="text-xs leading-relaxed">
                                            O login usa usuários no banco. Crie o primeiro com{" "}
                                            <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">bun run seed:portal-user</code>{" "}
                                            (variáveis{" "}
                                            <code className="rounded bg-black/5 px-1 py-0.5 text-xs dark:bg-white/10">PAZINI_LOGIN_*</code>
                                            ) ou pela tela Usuários após entrar.
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

                            <Button type="submit" size="lg" className="mt-2 w-full rounded-xl text-base font-semibold shadow-md">
                                Entrar
                            </Button>
                        </form>
                    </div>

                    <p className="text-center text-xs text-muted-foreground text-balance">
                        {branding.company_name} · Acesso restrito a usuários autorizados
                    </p>
                    </div>

                    <LoginHighlightsCard className="mx-auto w-full max-w-[440px] lg:sticky lg:top-8 lg:mx-0 lg:max-w-none" />
                </div>
            </main>
        </div>
    );
}
