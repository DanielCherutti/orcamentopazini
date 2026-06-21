"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { TenantLicensePlan } from "@/types/tenant-types";
import { createPlatformOrganizationAction } from "@/actions/platform-actions";
import { getPlatformLicenseSettingsAction } from "@/actions/platform-license-actions";
import { OrganizationCompanyFields } from "@/components/platform/organization-company-fields";
import {
    DEFAULT_PLATFORM_PLANS,
    formatBrl,
    type PlanDefinition,
} from "@/lib/platform-license";
import {
    EMPTY_ORGANIZATION_COMPANY,
    type OrganizationCompanyFormValues,
} from "@/lib/organization-company";
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

function slugifyClient(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

export function CreateOrganizationDialog({ open, onOpenChange }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [plans, setPlans] =
        useState<Record<TenantLicensePlan, PlanDefinition>>(DEFAULT_PLATFORM_PLANS);
    const [slug, setSlug] = useState("");
    const [slugTouched, setSlugTouched] = useState(false);
    const [maxUsers, setMaxUsers] = useState(
        String(DEFAULT_PLATFORM_PLANS.standard.defaultMaxUsers),
    );
    const [licensePlan, setLicensePlan] = useState<TenantLicensePlan>("standard");
    const [company, setCompany] = useState<OrganizationCompanyFormValues>(
        EMPTY_ORGANIZATION_COMPANY,
    );

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
        setSlug("");
        setSlugTouched(false);
        setMaxUsers(String(plans.standard.defaultMaxUsers));
        setLicensePlan("standard");
        setCompany(EMPTY_ORGANIZATION_COMPANY);
    }

    function handleOpenChange(next: boolean) {
        if (!next) reset();
        onOpenChange(next);
    }

    function patchCompany(patch: Partial<OrganizationCompanyFormValues>) {
        setCompany((prev) => {
            const next = { ...prev, ...patch };
            if (!slugTouched && patch.legalName) {
                setSlug(slugifyClient(patch.legalName));
            }
            return next;
        });
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!company.legalName.trim()) {
            toast.error("Informe a razão social da empresa");
            return;
        }
        startTransition(async () => {
            const res = await createPlatformOrganizationAction({
                name: company.legalName.trim(),
                slug: slug || undefined,
                max_users: Number(maxUsers) || 10,
                license_plan: licensePlan,
                company,
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
            <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl" showCloseButton>
                <DialogHeader className="border-b px-6 py-4">
                    <DialogTitle>Nova organização</DialogTitle>
                    <DialogDescription>
                        Cadastro completo da empresa cliente, licença e limites de usuários.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 space-y-6">
                        <OrganizationCompanyFields
                            values={company}
                            onChange={patchCompany}
                            disabled={pending}
                            onLegalNameResolved={(legalName) => {
                                if (!slugTouched) setSlug(slugifyClient(legalName));
                            }}
                        />

                        <div className="space-y-3 border-t pt-4">
                            <h3 className="text-sm font-semibold">Licença</h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="new-org-slug">Slug / subdomínio</Label>
                                    <Input
                                        id="new-org-slug"
                                        value={slug}
                                        onChange={(e) => {
                                            setSlugTouched(true);
                                            setSlug(e.target.value);
                                        }}
                                        placeholder="Auto a partir da razão social"
                                        disabled={pending}
                                        className="h-10 font-mono text-sm"
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
                        </div>
                    </div>
                    <DialogFooter className="gap-2 border-t px-6 py-4 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={pending}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending || !company.legalName.trim()}>
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
