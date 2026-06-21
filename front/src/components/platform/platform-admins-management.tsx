"use client";

import { useMemo, useState, useTransition } from "react";
import {
    demotePlatformAdminByUserIdAction,
    promotePlatformAdminByUserIdAction,
    type PlatformAdminCandidate,
    type PlatformAdminItem,
} from "@/actions/platform-admin-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import { Shield, UserMinus, UserPlus } from "lucide-react";

export function PlatformAdminsManagement({
    initialAdmins,
    initialCandidates,
}: {
    initialAdmins: PlatformAdminItem[];
    initialCandidates: PlatformAdminCandidate[];
}) {
    const [admins, setAdmins] = useState(initialAdmins);
    const [candidates, setCandidates] = useState(initialCandidates);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [search, setSearch] = useState("");
    const [pending, startTransition] = useTransition();

    const filteredCandidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return candidates;
        return candidates.filter((c) => c.email.includes(q));
    }, [candidates, search]);

    const selectedCandidate = candidates.find((c) => c.userId === selectedUserId);
    const canPromote =
        Boolean(selectedCandidate) && !selectedCandidate?.pending_setup && selectedCandidate?.active !== false;

    function promote() {
        if (!selectedUserId || !canPromote) return;
        startTransition(async () => {
            const res = await promotePlatformAdminByUserIdAction(selectedUserId);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao promover");
                return;
            }
            const promoted = candidates.find((c) => c.userId === selectedUserId);
            if (promoted) {
                setAdmins((prev) => [
                    ...prev,
                    { userId: promoted.userId, email: promoted.email, active: promoted.active },
                ]);
                setCandidates((prev) => prev.filter((c) => c.userId !== selectedUserId));
            }
            setSelectedUserId("");
            setSearch("");
            toast.success("Admin promovido — peça logout/login para acessar /platform");
        });
    }

    function demote(item: PlatformAdminItem) {
        if (!confirm(`Revogar acesso de plataforma de ${item.email}?`)) return;
        startTransition(async () => {
            const res = await demotePlatformAdminByUserIdAction(item.userId);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao revogar");
                return;
            }
            setAdmins((prev) => prev.filter((a) => a.userId !== item.userId));
            setCandidates((prev) => [
                ...prev,
                {
                    userId: item.userId,
                    email: item.email,
                    active: item.active,
                    pending_setup: false,
                    organization_count: 0,
                },
            ].sort((a, b) => a.email.localeCompare(b.email)));
            toast.success("Acesso revogado");
        });
    }

    return (
        <Card className="border-border/70 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-violet-600" />
                    Admins da plataforma
                </CardTitle>
                <CardDescription>
                    Usuários com acesso ao painel de revenda (/platform). Selecione um usuário já
                    cadastrado no portal — não há convite por e-mail. Promover remove memberships em
                    orgs clientes; o usuário precisa fazer logout/login para acessar /platform.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-3">
                    <div className="space-y-1">
                        <label className="text-sm font-medium" htmlFor="promote-search">
                            Promover usuário existente
                        </label>
                        <Input
                            id="promote-search"
                            type="search"
                            placeholder="Buscar por e-mail..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                            <Select
                                value={selectedUserId || undefined}
                                onValueChange={setSelectedUserId}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um usuário do portal" />
                                </SelectTrigger>
                                <SelectContent>
                                    {filteredCandidates.length === 0 ? (
                                        <SelectItem value="__empty" disabled>
                                            Nenhum usuário disponível
                                        </SelectItem>
                                    ) : (
                                        filteredCandidates.map((candidate) => (
                                            <SelectItem
                                                key={candidate.userId}
                                                value={candidate.userId}
                                                disabled={candidate.pending_setup}
                                            >
                                                {candidate.email}
                                                {candidate.pending_setup
                                                    ? " (senha pendente)"
                                                    : candidate.organization_count > 0
                                                      ? ` · ${candidate.organization_count} org(s)`
                                                      : ""}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={promote} disabled={pending || !canPromote}>
                            <UserPlus className="h-4 w-4" />
                            Promover
                        </Button>
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>E-mail</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-32" />
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {admins.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={3} className="text-muted-foreground">
                                    Nenhum admin cadastrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            admins.map((admin) => (
                                <TableRow key={admin.userId || admin.email}>
                                    <TableCell>{admin.email}</TableCell>
                                    <TableCell>{admin.active !== false ? "Ativo" : "Inativo"}</TableCell>
                                    <TableCell>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive"
                                            disabled={pending}
                                            onClick={() => demote(admin)}
                                        >
                                            <UserMinus className="h-4 w-4" />
                                            Revogar
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
