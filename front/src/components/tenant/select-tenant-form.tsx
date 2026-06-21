"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Loader2 } from "lucide-react";
import {
    listMyTenantsAction,
    switchTenantAndRedirectAction,
} from "@/actions/tenant-actions";
import type { TenantMembership } from "@/types/tenant-types";
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
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        void listMyTenantsAction().then((res) => {
            if (!res.success || !res.data) {
                setLoadError(res.error ?? "Erro ao carregar organizações");
            } else {
                setTenants(res.data);
            }
            setLoading(false);
        });
    }, []);

    const denied = errorCode === "denied";

    return (
        <Card className="w-full max-w-lg border-border/70 shadow-lg">
            <CardHeader className="text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-6 w-6" />
                </div>
                <CardTitle>Selecione a organização</CardTitle>
                <CardDescription>
                    Sua conta tem acesso a mais de uma organização. Escolha qual deseja usar agora.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {denied && (
                    <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        Sem acesso à organização selecionada.
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
