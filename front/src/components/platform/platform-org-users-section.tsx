"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    createPlatformOrganizationUserAction,
    setPlatformOrganizationUserPasswordAction,
    type PlatformOrgMember,
} from "@/actions/platform-actions";
import { PasswordRequirementsHint } from "@/components/settings/password-requirements-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { toast } from "@/lib/toast";
import type { OrganizationMemberRole } from "@/types/tenant-types";
import { KeyRound, UserPlus } from "lucide-react";

function CreateOrgUserDialog({
    tenantRef,
    open,
    onOpenChange,
}: {
    tenantRef: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [role, setRole] = useState<OrganizationMemberRole>("user");
    const [password, setPassword] = useState("");

    function handleOpenChange(next: boolean) {
        if (!next) {
            setError(null);
            setFieldErrors({});
            setRole("user");
            setPassword("");
        }
        onOpenChange(next);
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("role", role);
        setError(null);
        setFieldErrors({});

        startTransition(async () => {
            const r = await createPlatformOrganizationUserAction(tenantRef, fd);
            if (r.success) {
                form.reset();
                setPassword("");
                handleOpenChange(false);
                router.refresh();
                toast.success(r.message ?? "Usuário criado com sucesso.");
                return;
            }
            if (r.error) setError(r.error);
            if (r.fieldErrors) setFieldErrors(r.fieldErrors);
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" showCloseButton>
                <DialogHeader>
                    <DialogTitle>Criar usuário</DialogTitle>
                    <DialogDescription>
                        Informe e-mail, senha e papel para esta empresa. Se o e-mail já existir no
                        sistema, a pessoa será apenas vinculada à organização.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="platform-org-new-email">E-mail</Label>
                        <Input
                            id="platform-org-new-email"
                            name="email"
                            type="email"
                            required
                            autoComplete="off"
                            placeholder="nome@empresa.com"
                            disabled={pending}
                        />
                        {fieldErrors.email?.[0] && (
                            <p className="text-sm text-destructive">{fieldErrors.email[0]}</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="platform-org-new-role">Papel nesta organização</Label>
                        <Select
                            value={role}
                            onValueChange={(v) => setRole(v as OrganizationMemberRole)}
                            disabled={pending}
                        >
                            <SelectTrigger id="platform-org-new-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="platform-org-new-password">Senha inicial</Label>
                        <Input
                            id="platform-org-new-password"
                            name="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            disabled={pending}
                        />
                        <PasswordRequirementsHint password={password} />
                        {fieldErrors.password?.map((msg) => (
                            <p key={msg} className="text-sm text-destructive">
                                {msg}
                            </p>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="platform-org-new-password-confirm">Confirmar senha</Label>
                        <Input
                            id="platform-org-new-password-confirm"
                            name="passwordConfirm"
                            type="password"
                            required
                            autoComplete="new-password"
                            disabled={pending}
                        />
                        {fieldErrors.passwordConfirm?.[0] && (
                            <p className="text-sm text-destructive">{fieldErrors.passwordConfirm[0]}</p>
                        )}
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleOpenChange(false)}
                            disabled={pending}
                        >
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Criando…" : "Criar usuário"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function SetOrgUserPasswordDialog({
    tenantRef,
    member,
    open,
    onOpenChange,
    onSuccess,
}: {
    tenantRef: string;
    member: PlatformOrgMember | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const [password, setPassword] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
    const [pending, startTransition] = useTransition();

    function handleOpenChange(next: boolean) {
        if (!next) {
            setPassword("");
            setPasswordConfirm("");
            setFieldErrors({});
        }
        onOpenChange(next);
    }

    function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!member?.userId) return;
        setFieldErrors({});
        startTransition(async () => {
            const res = await setPlatformOrganizationUserPasswordAction({
                tenantRef,
                userId: member.userId,
                password,
                passwordConfirm,
            });
            if (!res.success) {
                if (res.fieldErrors) setFieldErrors(res.fieldErrors);
                else toast.error(res.error ?? "Erro ao definir senha");
                return;
            }
            toast.success("Senha definida — o usuário já pode entrar no portal da empresa");
            handleOpenChange(false);
            onSuccess();
        });
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Definir senha</DialogTitle>
                    <DialogDescription>
                        {member?.email} — informe a senha para acesso ao portal da empresa.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="org-user-password">Nova senha</Label>
                        <Input
                            id="org-user-password"
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
                        <Label htmlFor="org-user-password-confirm">Confirmar senha</Label>
                        <Input
                            id="org-user-password-confirm"
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
                        <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
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

type Props = {
    tenantRef: string;
    members: PlatformOrgMember[];
    canWrite: boolean;
};

export function PlatformOrgUsersSection({ tenantRef, members, canWrite }: Props) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [passwordMember, setPasswordMember] = useState<PlatformOrgMember | null>(null);
    const [passwordOpen, setPasswordOpen] = useState(false);

    return (
        <>
            <Card className="platform-panel border-0 shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                        <CardTitle className="text-base">Usuários</CardTitle>
                        <CardDescription>
                            {canWrite
                                ? "Crie usuários com e-mail e senha ou altere senhas pendentes."
                                : "Lista de usuários vinculados à empresa (somente leitura)."}
                        </CardDescription>
                    </div>
                    {canWrite && (
                        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => setCreateOpen(true)}>
                            <UserPlus className="size-4" />
                            Criar usuário
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum usuário vinculado.</p>
                    ) : (
                        <ul className="divide-y text-sm">
                            {members.map((m) => (
                                <li key={m.userId} className="flex items-center justify-between gap-2 py-2">
                                    <div className="min-w-0">
                                        <p className="truncate">{m.email}</p>
                                        <p className="text-muted-foreground text-xs">
                                            {m.role === "admin" ? "Administrador" : "Usuário"}
                                            {!m.active ? " · inativo" : ""}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {m.pending_setup && (
                                            <Badge variant="secondary">Sem senha</Badge>
                                        )}
                                        {canWrite && m.pending_setup && (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                className="gap-1"
                                                onClick={() => {
                                                    setPasswordMember(m);
                                                    setPasswordOpen(true);
                                                }}
                                            >
                                                <KeyRound className="size-3.5" />
                                                Senha
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {canWrite && (
                <>
                    <CreateOrgUserDialog
                        tenantRef={tenantRef}
                        open={createOpen}
                        onOpenChange={setCreateOpen}
                    />
                    <SetOrgUserPasswordDialog
                        tenantRef={tenantRef}
                        member={passwordMember}
                        open={passwordOpen}
                        onOpenChange={setPasswordOpen}
                        onSuccess={() => router.refresh()}
                    />
                </>
            )}
        </>
    );
}
