"use client";

import { useEffect, useState, useTransition } from "react";
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

export function SelectTenantForm({ errorCode }: { errorCode?: string | null }) {
    const [tenants, setTenants] = useState<TenantMembership[]>([]);
    const [platformRole, setPlatformRole] = useState<PlatformRole | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();

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

    return (
        <Card className="w-full max-w-lg border-border/70 shadow-lg">
            <CardHeader className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {hasPlatform && !hasOrgs ? (
                        <Shield className="h-6 w-6" />
                    ) : (
                        <Building2 className="h-6 w-6" />
                    )}
                </div>
                <CardTitle>
                    {hasPlatform && hasOrgs ? "Para onde deseja ir?" : "Selecione a organização"}
                </CardTitle>
                <CardDescription>
                    {hasPlatform && hasOrgs
                        ? "Sua conta tem acesso ao painel da plataforma e a empresas. Escolha o destino."
                        : "Sua conta tem acesso a mais de uma organização. Escolha qual deseja usar agora."}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {denied && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        Sem acesso ao destino selecionado.
                    </p>
                )}
                {loading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Carregando…
                    </div>
                )}
                {loadError && (
                    <p className="text-sm text-destructive text-center">{loadError}</p>
                )}
                {!loading && hasPlatform && (
                    <form action={switchToPlatformAndRedirectAction}>
                        <Button
                            type="submit"
                            variant="outline"
                            className="h-auto w-full justify-between border-violet-200 bg-violet-50/50 px-4 py-3 text-left hover:bg-violet-50 dark:border-violet-900 dark:bg-violet-950/30"
                            disabled={pending}
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
                    </form>
                )}
                {!loading &&
                    tenants.map((t) => (
                        <form
                            key={t.tenantId}
                            action={switchTenantAndRedirectAction.bind(null, t.tenantId)}
                        >
                            <Button
                                type="submit"
                                variant="outline"
                                className="h-auto w-full justify-between px-4 py-3 text-left"
                                disabled={pending}
                            >
                                <span>
                                    <span className="block font-medium">{t.tenantName}</span>
                                    <span className="block text-xs text-muted-foreground">
                                        {t.tenantSlug} · {t.role}
                                    </span>
                                </span>
                                <Loader2
                                    className={`h-4 w-4 shrink-0 ${pending ? "animate-spin opacity-100" : "opacity-0"}`}
                                />
                            </Button>
                        </form>
                    ))}
            </CardContent>
        </Card>
    );
}
