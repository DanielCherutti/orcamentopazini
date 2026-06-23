"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Tenant } from "@/types/tenant-types";
import {
    createTenantAction,
    deactivateTenantAction,
    updateTenantAction,
} from "@/actions/tenant-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus } from "lucide-react";
import { toast } from "@/lib/toast";

export function TenantsManagement({ initialTenants }: { initialTenants: Tenant[] }) {
    const router = useRouter();
    const [tenants, setTenants] = useState(initialTenants);
    const [name, setName] = useState("");
    const [slug, setSlug] = useState("");
    const [pending, startTransition] = useTransition();

    function refreshList() {
        router.refresh();
    }

    function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await createTenantAction({ name, slug: slug || undefined });
            if (!res.success || !res.data) {
                toast.error(res.error ?? "Erro ao criar organização");
                return;
            }
            setTenants((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
            setName("");
            setSlug("");
            toast.success(`Organização "${res.data.name}" criada`);
            refreshList();
        });
    }

    function toggleActive(tenant: Tenant) {
        const next = !(tenant.active !== false);
        startTransition(async () => {
            if (!next) {
                const ok = confirm(`Desativar "${tenant.name}"? Usuários perdem acesso a esta org.`);
                if (!ok) return;
                const res = await deactivateTenantAction(tenant.id);
                if (!res.success) {
                    toast.error(res.error ?? "Erro ao desativar");
                    return;
                }
                setTenants((prev) => prev.filter((t) => t.id !== tenant.id));
                toast.success("Organização desativada");
                refreshList();
                return;
            }
            const res = await updateTenantAction({ tenantId: tenant.id, active: true });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao reativar");
                return;
            }
            setTenants((prev) =>
                prev.map((t) => (t.id === tenant.id ? { ...t, active: true } : t)),
            );
            toast.success("Organização reativada");
        });
    }

    return (
        <div className="space-y-8">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    <h2 className="text-base font-semibold">Nova organização</h2>
                </div>
                <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="tenant-name">Nome</Label>
                        <Input
                            id="tenant-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Ex.: Engenharia XYZ"
                            required
                            disabled={pending}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="tenant-slug">Slug (opcional)</Label>
                        <Input
                            id="tenant-slug"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            placeholder="engenharia-xyz"
                            disabled={pending}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <Button type="submit" disabled={pending || !name.trim()}>
                            <Plus className="h-4 w-4" />
                            {pending ? "Criando…" : "Criar organização"}
                        </Button>
                    </div>
                </form>
            </div>

            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="border-b border-border bg-muted/30 px-5 py-4">
                    <h2 className="text-base font-semibold">Organizações ativas</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {tenants.length} organização{tenants.length === 1 ? "" : "ões"} no sistema.
                    </p>
                </div>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Nome</TableHead>
                            <TableHead>Slug</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {tenants.map((t) => (
                            <TableRow key={t.id}>
                                <TableCell className="font-medium">{t.name}</TableCell>
                                <TableCell className="text-muted-foreground">{t.slug}</TableCell>
                                <TableCell>
                                    {t.active !== false ? (
                                        <Badge variant="secondary">Ativa</Badge>
                                    ) : (
                                        <Badge variant="destructive">Inativa</Badge>
                                    )}
                                </TableCell>
                                <TableCell className="text-right">
                                    {t.id !== "tenant:pazini" && t.active !== false && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            disabled={pending}
                                            onClick={() => toggleActive(t)}
                                        >
                                            Desativar
                                        </Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
