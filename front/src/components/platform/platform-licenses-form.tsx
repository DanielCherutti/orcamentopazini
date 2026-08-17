"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    resetPlatformLicenseSettingsAction,
    updatePlatformLicenseSettingsAction,
} from "@/actions/platform-license-actions";
import { PlanBadge } from "@/components/platform/platform-utils";
import {
    formatBrl,
    PLAN_IDS,
    type PlanFormState,
} from "@/lib/platform-license";
import type { TenantLicensePlan } from "@/types/tenant-types";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "@/lib/toast";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";

type Props = {
    initialForm: Record<TenantLicensePlan, PlanFormState>;
    updatedAt: string | null;
};

export function PlatformLicensesForm({ initialForm, updatedAt }: Props) {
    const router = useRouter();
    const { can } = usePlatformPermissions();
    const canEdit = can("licenses.write");
    const [form, setForm] = useState(initialForm);
    const [pending, startTransition] = useTransition();
    const [resetPending, startResetTransition] = useTransition();

    function patchPlan(id: TenantLicensePlan, patch: Partial<PlanFormState>) {
        setForm((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updatePlatformLicenseSettingsAction(form);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao salvar");
                return;
            }
            toast.success("Planos e preços atualizados");
            router.refresh();
        });
    }

    function handleReset() {
        if (!confirm("Restaurar valores padrão dos planos?")) return;
        startResetTransition(async () => {
            const res = await resetPlatformLicenseSettingsAction();
            if (!res.success) {
                toast.error(res.error ?? "Erro ao restaurar");
                return;
            }
            toast.success("Valores padrão restaurados");
            router.refresh();
        });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {!canEdit && (
                <p className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    Você tem acesso somente leitura aos planos e preços.
                </p>
            )}
            {updatedAt && (
                <p className="text-xs text-muted-foreground">
                    Última alteração:{" "}
                    {new Date(updatedAt).toLocaleString("pt-BR")}
                </p>
            )}

            <div className="grid gap-6 xl:grid-cols-3">
                {PLAN_IDS.map((id) => {
                    const row = form[id];
                    const pricePreview = Number(row.monthlyPriceBrl.replace(",", "."));
                    return (
                        <Card key={id} className="platform-ops-surface border-0 shadow-none">
                            <CardHeader className="border-b border-violet-500/15 bg-violet-500/[0.06]">
                                <div className="flex items-center justify-between gap-2">
                                    <PlanBadge plan={id} />
                                    <span className="text-sm font-semibold tabular-nums text-emerald-700">
                                        {formatBrl(Number.isFinite(pricePreview) ? pricePreview : 0)}
                                        /mês
                                    </span>
                                </div>
                                <CardTitle className="text-base pt-2">
                                    Plano {row.label || id}
                                </CardTitle>
                                <CardDescription>
                                    Preço de referência para MRR e novas organizações.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-5">
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-label`}>Nome exibido</Label>
                                    <Input
                                        id={`${id}-label`}
                                        value={row.label}
                                        onChange={(e) =>
                                            patchPlan(id, { label: e.target.value })
                                        }
                                        disabled={pending || !canEdit}
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-price`}>Preço mensal (R$)</Label>
                                    <Input
                                        id={`${id}-price`}
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={row.monthlyPriceBrl}
                                        onChange={(e) =>
                                            patchPlan(id, { monthlyPriceBrl: e.target.value })
                                        }
                                        disabled={pending || !canEdit}
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-max`}>Usuários sugeridos (novas orgs)</Label>
                                    <Input
                                        id={`${id}-max`}
                                        type="number"
                                        min={1}
                                        value={row.defaultMaxUsers}
                                        onChange={(e) =>
                                            patchPlan(id, { defaultMaxUsers: e.target.value })
                                        }
                                        disabled={pending || !canEdit}
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-desc`}>Descrição curta</Label>
                                    <Input
                                        id={`${id}-desc`}
                                        value={row.description}
                                        onChange={(e) =>
                                            patchPlan(id, { description: e.target.value })
                                        }
                                        disabled={pending || !canEdit}
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor={`${id}-features`}>
                                        Benefícios (um por linha)
                                    </Label>
                                    <Textarea
                                        id={`${id}-features`}
                                        value={row.featuresText}
                                        onChange={(e) =>
                                            patchPlan(id, { featuresText: e.target.value })
                                        }
                                        disabled={pending || !canEdit}
                                        rows={4}
                                        className="resize-y text-sm"
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {canEdit && (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-violet-500/15 bg-violet-500/[0.06] p-4">
                    <Button type="submit" disabled={pending || resetPending}>
                        {pending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Salvando…
                            </>
                        ) : (
                            <>
                                <Save className="h-4 w-4" />
                                Salvar planos
                            </>
                        )}
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        disabled={pending || resetPending}
                        onClick={handleReset}
                    >
                        {resetPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Restaurando…
                            </>
                        ) : (
                            <>
                                <RotateCcw className="h-4 w-4" />
                                Restaurar padrões
                            </>
                        )}
                    </Button>
                    <p className="text-sm text-muted-foreground">
                        O MRR do dashboard recalcula automaticamente. Organizações já criadas
                        mantêm o limite de usuários atual até você editar cada uma.
                    </p>
                </div>
            )}
        </form>
    );
}
