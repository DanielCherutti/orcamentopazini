"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { OrganizationListItem } from "@/actions/platform-actions";
import {
    deactivatePlatformOrganizationAction,
    reactivatePlatformOrganizationAction,
} from "@/actions/platform-actions";
import { CreateOrganizationDialog } from "@/components/platform/create-organization-dialog";
import { PlatformContentCard } from "@/components/layout/platform-page-shell";
import {
    getOrganizationLicenseStatus,
    LicenseStatusBadge,
    OrgAvatar,
    PlanBadge,
    UsageBar,
} from "@/components/platform/platform-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";
import { toast } from "@/lib/toast";
import type { TenantLicensePlan } from "@/types/tenant-types";

type StatusFilter = "all" | "active" | "inactive" | "expiring" | "expired" | "user_limit";

export function PlatformOrganizationsManagement({
    initialOrganizations,
}: {
    initialOrganizations: OrganizationListItem[];
}) {
    const router = useRouter();
    const [organizations, setOrganizations] = useState(initialOrganizations);
    const [query, setQuery] = useState("");
    const [planFilter, setPlanFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [createOpen, setCreateOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const { can } = usePlatformPermissions();
    const canWrite = can("orgs.write");

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return organizations
            .filter((o) => {
                if (q && !o.name.toLowerCase().includes(q) && !o.slug.toLowerCase().includes(q)) {
                    return false;
                }
                if (planFilter !== "all" && (o.license_plan ?? "standard") !== planFilter) {
                    return false;
                }
                const status = getOrganizationLicenseStatus(o);
                if (statusFilter === "active" && status !== "active") return false;
                if (statusFilter === "inactive" && status !== "inactive") return false;
                if (statusFilter === "expiring" && status !== "expiring") return false;
                if (statusFilter === "expired" && status !== "expired") return false;
                if (statusFilter === "user_limit") {
                    if (o.max_users == null || o.max_users <= 0) return false;
                    if (o.member_count / o.max_users < 0.9) return false;
                }
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }, [organizations, query, planFilter, statusFilter]);

    function deactivate(org: OrganizationListItem, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const ok = confirm(`Desativar "${org.name}"? Usuários perdem acesso a esta org.`);
        if (!ok) return;
        startTransition(async () => {
            const res = await deactivatePlatformOrganizationAction(org.id);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao desativar");
                return;
            }
            setOrganizations((prev) =>
                prev.map((o) => (o.id === org.id ? { ...o, active: false } : o)),
            );
            toast.success("Organização desativada");
            router.refresh();
        });
    }

    function reactivate(org: OrganizationListItem, e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        startTransition(async () => {
            const res = await reactivatePlatformOrganizationAction(org.id);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao reativar");
                return;
            }
            setOrganizations((prev) =>
                prev.map((o) => (o.id === org.id ? { ...o, active: true } : o)),
            );
            toast.success("Organização reativada");
            router.refresh();
        });
    }

    return (
        <>
            <PlatformContentCard>
                <div className="border-b border-violet-500/15 px-6 py-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-[0.14em] text-slate-700">
                                Empresas clientes
                            </h2>
                            <p className="mt-1 text-sm text-slate-600/50">
                                Licenças, limites e identidade visual por organização.
                            </p>
                        </div>
                        {canWrite ? (
                            <Button onClick={() => setCreateOpen(true)} className="shrink-0 rounded-xl">
                                <Plus className="h-4 w-4" />
                                Nova organização
                            </Button>
                        ) : null}
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                        <div className="relative max-w-sm flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-400/60" />
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar por nome ou slug…"
                                className="h-10 rounded-lg border-violet-500/25 bg-violet-500/10 pl-9 text-slate-900 placeholder:text-slate-600/40"
                            />
                        </div>
                        <Select value={planFilter} onValueChange={setPlanFilter}>
                            <SelectTrigger className="w-full rounded-lg border-violet-500/25 bg-violet-500/10 text-slate-900 sm:w-40">
                                <SelectValue placeholder="Plano" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos planos</SelectItem>
                                {(["trial", "standard", "professional"] as TenantLicensePlan[]).map(
                                    (p) => (
                                        <SelectItem key={p} value={p}>
                                            {p}
                                        </SelectItem>
                                    ),
                                )}
                            </SelectContent>
                        </Select>
                        <Select
                            value={statusFilter}
                            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
                        >
                            <SelectTrigger className="w-full rounded-lg border-violet-500/25 bg-violet-500/10 text-slate-900 sm:w-44">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos status</SelectItem>
                                <SelectItem value="active">Ativas</SelectItem>
                                <SelectItem value="inactive">Inativas</SelectItem>
                                <SelectItem value="expiring">Vencendo (30d)</SelectItem>
                                <SelectItem value="expired">Vencidas</SelectItem>
                                <SelectItem value="user_limit">Limite usuários</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div>
                    {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
                                <Building2 className="h-7 w-7 text-violet-600" />
                            </div>
                            <div>
                                <p className="font-medium">
                                    {query ? "Nenhum resultado" : "Nenhuma organização ainda"}
                                </p>
                                <p className="mt-1 max-w-sm text-sm text-slate-600/50">
                                    {query
                                        ? "Tente outro termo ou filtro."
                                        : "Crie a primeira empresa cliente para começar."}
                                </p>
                            </div>
                            {!query && (
                                <Button variant="outline" onClick={() => setCreateOpen(true)}>
                                    <Plus className="h-4 w-4" />
                                    Criar organização
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="app-table">
                        <Table>
                            <TableHeader>
                                <TableRow className="border-violet-500/10 hover:bg-transparent">
                                    <TableHead className="pl-6">Organização</TableHead>
                                    <TableHead>Plano</TableHead>
                                    <TableHead>Uso de usuários</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-10 pr-6" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filtered.map((org) => (
                                    <TableRow
                                        key={org.id}
                                        className="group cursor-pointer transition-colors hover:bg-violet-500/[0.04]"
                                        onClick={() =>
                                            router.push(`/platform/organizations/${org.slug}`)
                                        }
                                    >
                                        <TableCell className="pl-6">
                                            <div className="flex items-center gap-3">
                                                <OrgAvatar name={org.name} />
                                                <div className="min-w-0">
                                                    <p className="font-medium truncate">{org.name}</p>
                                                    <p className="text-xs font-mono text-slate-600/45 truncate">
                                                        {org.slug}
                                                    </p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <PlanBadge plan={org.license_plan} />
                                        </TableCell>
                                        <TableCell>
                                            <UsageBar used={org.member_count} max={org.max_users} />
                                        </TableCell>
                                        <TableCell>
                                            <LicenseStatusBadge org={org} />
                                        </TableCell>
                                        <TableCell className="pr-6 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {canWrite && org.active !== false ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                                        disabled={pending}
                                                        onClick={(e) => deactivate(org, e)}
                                                    >
                                                        Desativar
                                                    </Button>
                                                ) : canWrite ? (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="opacity-0 group-hover:opacity-100"
                                                        disabled={pending}
                                                        onClick={(e) => reactivate(org, e)}
                                                    >
                                                        Reativar
                                                    </Button>
                                                ) : null}
                                                <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground" />
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    )}
                </div>
            </PlatformContentCard>

            {canWrite && (
                <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
            )}
        </>
    );
}
