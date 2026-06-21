"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { TenantLicensePlan } from "@/types/tenant-types";
import { createPlatformOrganizationAction } from "@/actions/platform-actions";
import { getPlatformLicenseSettingsAction } from "@/actions/platform-license-actions";
import {
    DEFAULT_PLATFORM_PLANS,
    formatBrl,
    type PlanDefinition,
} from "@/lib/platform-license";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [plans, setPlans] =
        useState<Record<TenantLicensePlan, PlanDefinition>>(DEFAULT_PLATFORM_PLANS);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [maxUsers, setMaxUsers] = useState(
        String(DEFAULT_PLATFORM_PLANS.standard.defaultMaxUsers),
    );
    const [licensePlan, setLicensePlan] = useState<TenantLicensePlan>("standard");

    useEffect(() => {
        if (!open) return;
        getPlatformLicenseSettingsAction().then((res) => {
            if (res.success && res.data?.plans) {
                setPlans(res.data.plans);
                setMaxUsers(String(res.data.plans.standard.defaultMaxUsers));
            }
        });
    }, [open]);

    function applyPlanDefaults(plan: TenantLicensePlan) {
        setLicensePlan(plan);
        setMaxUsers(String(plans[plan].defaultMaxUsers));
    }

    function reset() {
        setName("");
        setSlug("");
        setMaxUsers(String(plans.standard.defaultMaxUsers));
        setLicensePlan("standard");
    }

    function handleOpenChange(next: boolean) {
        if (!next) reset();
        onOpenChange(next);
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await createPlatformOrganizationAction({
                name,
                slug: slug || undefined,
                max_users: Number(maxUsers) || 10,
                license_plan: licensePlan,
            });
            if (!res.success || !res.data) {
                toast.error(res.error ?? "Erro ao criar organização");
                return;
            }
            toast.success(`Organização "${res.data.name}" criada`);
            handleOpenChange(false);
            router.refresh();
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-lg" showCloseButton>
                <DialogHeader>
                    <DialogTitle>Nova organização</DialogTitle>
                    <DialogDescription>
                        Cria uma empresa cliente isolada com licença e limite de usuários.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="new-org-name">Nome da empresa</Label>
                            <Input
                                id="new-org-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="Ex.: Engenharia XYZ"
                                required
                                disabled={pending}
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-org-slug">Slug</Label>
                            <Input
                                id="new-org-slug"
                                value={slug}
                                onChange={(e) => setSlug(e.target.value)}
                                placeholder="Auto a partir do nome"
                                disabled={pending}
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-org-max">Limite de usuários</Label>
                            <Input
                                id="new-org-max"
                                type="number"
                                min={1}
                                value={maxUsers}
                                onChange={(e) => setMaxUsers(e.target.value)}
                                disabled={pending}
                                className="h-10"
                            />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="new-org-plan">Plano de licença</Label>
                            <Select
                                value={licensePlan}
                                onValueChange={(v) =>
                                    applyPlanDefaults(v as TenantLicensePlan)
                                }
                                disabled={pending}
                            >
                                <SelectTrigger id="new-org-plan" className="h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(["trial", "standard", "professional"] as const).map(
                                        (id) => (
                                            <SelectItem key={id} value={id}>
                                                {plans[id].label} —{" "}
                                                {formatBrl(plans[id].monthlyPriceBrl)}/mês ·{" "}
                                                {plans[id].defaultMaxUsers} usuários
                                            </SelectItem>
                                        ),
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={pending}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending || !name.trim()}>
                            {pending ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Criando…
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4" />
                                    Criar organização
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
