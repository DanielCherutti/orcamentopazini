"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Shield } from "lucide-react";
import {
    getLoginDestinationsAction,
    switchToPlatformAndRedirectAction,
} from "@/actions/login-routing-actions";
import { switchTenantAndRedirectAction } from "@/actions/tenant-actions";
import type { TenantMembership } from "@/types/tenant-types";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/types/platform-types";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

function DestinationIcon({
    hasPlatform,
    hasOrgs,
    authShell = false,
}: {
    hasPlatform: boolean;
    hasOrgs: boolean;
    authShell?: boolean;
}) {
    return (
        <div
            className={
                authShell
                    ? "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[color:rgb(var(--primary-rgb)/0.35)] bg-[color:rgb(var(--primary-rgb)/0.15)] text-[color:color-mix(in_srgb,var(--primary)_30%,#fff)]"
                    : "mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary"
            }
        >
            {hasPlatform && !hasOrgs ? (
                <Shield className="h-6 w-6" />
            ) : (
                <Building2 className="h-6 w-6" />
            )}
        </div>
    );
}

function DestinationList({
    denied,
    loading,
    loadError,
    hasPlatform,
    platformRole,
    tenants,
    authShell = false,
}: {
    denied: boolean;
    loading: boolean;
    loadError: string | null;
    hasPlatform: boolean;
    platformRole: PlatformRole | null;
    tenants: TenantMembership[];
    authShell?: boolean;
}) {
    return (
        <div className="space-y-3">
            {denied && (
                <p
                    className={
                        authShell
                            ? "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200"
                            : "rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                    }
                >
                    Sem acesso ao destino selecionado.
                </p>
            )}
            {loading && (
                <div
                    className={
                        authShell
                            ? "flex items-center justify-center gap-2 py-8 text-white/50"
                            : "flex items-center justify-center gap-2 py-8 text-muted-foreground"
                    }
                >
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Carregando…
                </div>
            )}
            {loadError && (
                <p className={authShell ? "text-center text-sm text-red-300" : "text-sm text-destructive text-center"}>
                    {loadError}
                </p>
            )}
            {!loading && hasPlatform && (
                <form action={switchToPlatformAndRedirectAction}>
                    {authShell ? (
                        <button
                            type="submit"
                            className="auth-destination-btn auth-destination-btn--platform w-full text-left"
                        >
                            <span className="flex items-center gap-2 font-medium text-white">
                                <Shield className="auth-destination-icon h-4 w-4 shrink-0" />
                                Painel da plataforma
                            </span>
                            <span className="auth-destination-btn-sub mt-0.5 block pl-6">
                                {PLATFORM_ROLE_LABELS[platformRole!]} · /platform
                            </span>
                        </button>
                    ) : (
                        <Button
                            type="submit"
                            variant="outline"
                            className="h-auto w-full justify-between border-violet-200 bg-violet-50/50 px-4 py-3 text-left hover:bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
                        >
                            <span>
                                <span className="flex items-center gap-2 font-medium">
                                    <Shield className="h-4 w-4 text-violet-600" />
                                    Painel da plataforma
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                    {PLATFORM_ROLE_LABELS[platformRole!]} · /platform
                                </span>
                            </span>
                        </Button>
                    )}
                </form>
            )}
            {!loading &&
                tenants.map((t) => (
                    <form key={t.tenantId} action={switchTenantAndRedirectAction.bind(null, t.tenantId)}>
                        {authShell ? (
                            <button type="submit" className="auth-destination-btn w-full text-left">
                                <span className="block font-medium text-white">{t.tenantName}</span>
                                <span className="auth-destination-btn-sub mt-0.5 block">
                                    {t.tenantSlug} · {t.role}
                                </span>
                            </button>
                        ) : (
                            <Button
                                type="submit"
                                variant="outline"
                                className="h-auto w-full justify-between px-4 py-3 text-left"
                            >
                                <span>
                                    <span className="block font-medium">{t.tenantName}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {t.tenantSlug} · {t.role}
                                    </span>
                                </span>
                                <Loader2 className="h-4 w-4 shrink-0 opacity-0" />
                            </Button>
                        )}
                    </form>
                ))}
        </div>
    );
}

export function SelectTenantForm({
    errorCode,
    embedded = false,
}: {
    errorCode?: string | null;
    embedded?: boolean;
}) {
    const [tenants, setTenants] = useState<TenantMembership[]>([]);
    const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        void getLoginDestinationsAction().then((res) => {
            if (!res.success || !res.data) {
                setLoadError(res.error ?? "Erro ao carregar destinos");
            } else {
                setTenants(res.data.tenants);
                setPlatformRole(res.data.platformRole);
            }
            setLoading(false);
        });
    }, []);

    const denied = errorCode === "denied";
    const hasPlatform = platformRole != null;
    const hasOrgs = tenants.length > 0;
    const title = hasPlatform && hasOrgs ? "Para onde deseja ir?" : "Selecione a organização";
    const description =
        hasPlatform && hasOrgs
            ? "Sua conta tem acesso ao painel da plataforma e a empresas. Escolha o destino."
            : "Sua conta tem acesso a mais de uma organização. Escolha qual deseja usar agora.";

    if (embedded) {
        return (
            <div>
                <div className="mb-6 space-y-1.5 text-center">
                    <DestinationIcon hasPlatform={hasPlatform} hasOrgs={hasOrgs} authShell />
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <p className="auth-muted text-sm leading-relaxed">{description}</p>
                </div>
                <DestinationList
                    denied={denied}
                    loading={loading}
                    loadError={loadError}
                    hasPlatform={hasPlatform}
                    platformRole={platformRole}
                    tenants={tenants}
                    authShell
                />
            </div>
        );
    }

    return (
        <Card className="w-full max-w-lg border-border/70 shadow-lg">
            <CardHeader className="text-center">
                <DestinationIcon hasPlatform={hasPlatform} hasOrgs={hasOrgs} />
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                <DestinationList
                    denied={denied}
                    loading={loading}
                    loadError={loadError}
                    hasPlatform={hasPlatform}
                    platformRole={platformRole}
                    tenants={tenants}
                />
            </CardContent>
        </Card>
    );
}
