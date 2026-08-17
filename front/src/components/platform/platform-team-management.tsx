"use client";

import { useState, useTransition } from "react";
import {
    createPlatformTeamMemberAction,
    revokePlatformTeamMemberAction,
    setPlatformTeamMemberPasswordAction,
    updatePlatformTeamMemberRoleAction,
    type PlatformTeamMember,
} from "@/actions/platform-team-actions";
import { PasswordRequirementsHint } from "@/components/settings/password-requirements-hint";
import { PlatformContentCard } from "@/components/layout/platform-page-shell";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/lib/toast";
import {
    INVITABLE_PLATFORM_ROLES,
    PLATFORM_ROLE_LABELS,
    type PlatformRole,
} from "@/types/platform-types";
import { KeyRound, Shield, UserMinus, UserPlus } from "lucide-react";

const ALL_ROLES: PlatformRole[] = ["super_admin", "commercial", "support", "readonly"];

function SetPasswordDialog({
    member,
    open,
    onOpenChange,
    onSuccess,
}: {
    member: PlatformTeamMember | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [pending, startTransition] = useTransition();

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!member?.userId) return;
        setFieldErrors({});
        startTransition(async () => {
            const res = await setPlatformTeamMemberPasswordAction({
                userId: member.userId,
                password,
                passwordConfirm,
            });
            if (!res.success) {
                if (res.fieldErrors) setFieldErrors(res.fieldErrors);
                else toast.error(res.error ?? "Erro ao definir senha");
                return;
            }
            toast.success("Senha definida — o usuário já pode entrar em /platform");
            setPassword("");
            setPasswordConfirm("");
            onOpenChange(false);
            onSuccess();
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Definir senha</DialogTitle>
                    <DialogDescription>
                        {member?.email} — informe a senha inicial para acesso ao painel /platform.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="team-password">Nova senha</Label>
                        <Input
                            id="team-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={pending}
                            autoComplete="new-password"
                        />
                        <PasswordRequirementsHint password={password} />
                        {fieldErrors.password?.map((msg) => (
                            <p key={msg} className="text-sm text-destructive">
                                {msg}
                            </p>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="team-password-confirm">Confirmar senha</Label>
                        <Input
                            id="team-password-confirm"
                            type="password"
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                            disabled={pending}
                            autoComplete="new-password"
                        />
                        {fieldErrors.passwordConfirm?.[0] && (
                            <p className="text-sm text-destructive">{fieldErrors.passwordConfirm[0]}</p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending}>
                            Salvar senha
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function PlatformTeamManagement({ initialMembers }: { initialMembers: PlatformTeamMember[] }) {
    const [members, setMembers] = useState(initialMembers);
    const [email, setEmail] = useState("");
    const [createRole, setCreateRole] = useState<PlatformRole>("commercial");
    const [passwordMember, setPasswordMember] = useState<PlatformTeamMember | null>(null);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    function createMember() {
        const value = email.trim();
        if (!value) return;
        startTransition(async () => {
            const res = await createPlatformTeamMemberAction({ email: value, role: createRole });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao criar usuário");
                return;
            }
            toast.success(res.message ?? "Usuário criado");
            setEmail("");
            if (res.data) {
                setMembers((prev) => {
                    const filtered = prev.filter((m) => m.email !== res.data!.email);
                    return [...filtered, res.data!].sort((a, b) => a.email.localeCompare(b.email));
                });
            }
        });
    }

    function changeRole(member: PlatformTeamMember, role: PlatformRole) {
        if (member.platform_role === role) return;
        startTransition(async () => {
            const res = await updatePlatformTeamMemberRoleAction({
                userId: member.userId,
                role,
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao alterar papel");
                return;
            }
            setMembers((prev) =>
                prev.map((m) => (m.userId === member.userId ? { ...m, platform_role: role } : m)),
            );
            toast.success("Papel atualizado");
        });
    }

    function revoke(member: PlatformTeamMember) {
        if (!confirm(`Revogar acesso de plataforma de ${member.email}?`)) return;
        startTransition(async () => {
            const res = await revokePlatformTeamMemberAction(member.userId);
            if (!res.success) {
                toast.error(res.error ?? "Erro ao revogar");
                return;
            }
            setMembers((prev) => prev.filter((m) => m.userId !== member.userId));
            toast.success("Acesso revogado");
        });
    }

    function openPasswordDialog(member: PlatformTeamMember) {
        setPasswordMember(member);
        setPasswordOpen(true);
    }

    return (
        <>
            <PlatformContentCard className="p-6">
                <div className="mb-6">
                    <h2 className="flex items-center gap-2 text-base font-black uppercase tracking-[0.14em] text-slate-700">
                        <Shield className="h-5 w-5 text-violet-400" />
                        Equipe
                    </h2>
                    <p className="mt-1 text-sm text-slate-600/50">
                        Mesma conta do login — adicione acesso ao painel /platform pelo e-mail e defina
                        a senha. Quem já usa uma empresa pode ter os dois destinos após entrar.
                    </p>
                </div>
                <div className="space-y-6">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-1">
                            <label className="text-sm font-medium" htmlFor="create-email">
                                E-mail do usuário
                            </label>
                            <Input
                                id="create-email"
                                type="email"
                                placeholder="novo@pazini.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="w-full space-y-1 sm:w-48">
                            <label className="text-sm font-medium">Papel</label>
                            <Select
                                value={createRole}
                                onValueChange={(v) => setCreateRole(v as PlatformRole)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {INVITABLE_PLATFORM_ROLES.map((role) => (
                                        <SelectItem key={role} value={role}>
                                            {PLATFORM_ROLE_LABELS[role]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={createMember} disabled={pending || !email.trim()}>
                            <UserPlus className="h-4 w-4" />
                            Criar usuário
                        </Button>
                    </div>

                    <div className="app-table overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>E-mail</TableHead>
                                <TableHead>Papel</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="w-52" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-slate-600/50">
                                        Nenhum membro cadastrado.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                members.map((member) => (
                                    <TableRow key={member.userId || member.email}>
                                        <TableCell>{member.email}</TableCell>
                                        <TableCell>
                                            <Select
                                                value={member.platform_role}
                                                onValueChange={(v) =>
                                                    changeRole(member, v as PlatformRole)
                                                }
                                                disabled={pending || !member.userId}
                                            >
                                                <SelectTrigger className="h-8 w-[180px]">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {ALL_ROLES.map((role) => (
                                                        <SelectItem key={role} value={role}>
                                                            {PLATFORM_ROLE_LABELS[role]}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </TableCell>
                                        <TableCell>
                                            {member.pending_setup ? (
                                                <Badge variant="outline">Senha pendente</Badge>
                                            ) : member.active !== false ? (
                                                "Ativo"
                                            ) : (
                                                "Inativo"
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-1">
                                                {member.pending_setup && member.userId && (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={pending}
                                                        onClick={() => openPasswordDialog(member)}
                                                    >
                                                        <KeyRound className="h-4 w-4" />
                                                        Definir senha
                                                    </Button>
                                                )}
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive"
                                                    disabled={pending || !member.userId}
                                                    onClick={() => revoke(member)}
                                                >
                                                    <UserMinus className="h-4 w-4" />
                                                    Revogar
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    </div>
                </div>
            </PlatformContentCard>

            <SetPasswordDialog
                member={passwordMember}
                open={passwordOpen}
                onOpenChange={setPasswordOpen}
                onSuccess={() => {
                    if (!passwordMember) return;
                    setMembers((prev) =>
                        prev.map((m) =>
                            m.userId === passwordMember.userId
                                ? { ...m, pending_setup: false }
                                : m,
                        ),
                    );
                }}
            />
        </>
    );
}
