"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PortalUserPublic } from "@/actions/portal-user-actions";
import {
    resetPortalUserPasswordAction,
    setPortalUserActiveAction,
    updatePortalUserTenantRoleAction,
} from "@/actions/portal-user-actions";
import { PasswordRequirementsHint } from "@/components/settings/password-requirements-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
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
import { Separator } from "@/components/ui/separator";
import type { OrganizationMemberRole } from "@/types/tenant-types";

type Props = {
    user: PortalUserPublic | null;
    sessionEmail: string | null;
    onOpenChange: (open: boolean) => void;
};

/** Estado isolado por usuário via `key={user.id}` no pai. */
function ManagePortalUserPanel({
    user,
    sessionEmail,
    onRequestClose,
}: {
    user: PortalUserPublic;
    sessionEmail: string | null;
    onRequestClose: () => void;
}) {
    const router = useRouter();

    const isSelf =
        sessionEmail &&
        user.email.trim().toLowerCase() ===
            sessionEmail.trim().toLowerCase();
    const isActive = user.active !== false;

    const [statusError, setStatusError] = useState<string | null>(null);
    const [statusPending, startStatusTransition] = useTransition();

    const [pwError, setPwError] = useState<string | null>(null);
    const [pwFieldErrors, setPwFieldErrors] = useState<
        Record<string, string[]>
    >({});
    const [pwOk, setPwOk] = useState(false);
    const [pwPending, startPwTransition] = useTransition();
    const [newPassword, setNewPassword] = useState("");

    const initialRole: OrganizationMemberRole =
        user.tenant_role === "admin" ? "admin" : "user";
    const [role, setRole] = useState<OrganizationMemberRole>(initialRole);
    const [roleError, setRoleError] = useState<string | null>(null);
    const [rolePending, startRoleTransition] = useTransition();

    function submitRole() {
        if (role === initialRole) return;
        setRoleError(null);
        const fd = new FormData();
        fd.set("userId", user.id);
        fd.set("role", role);
        startRoleTransition(async () => {
            const r = await updatePortalUserTenantRoleAction(fd);
            if (!r.success) {
                setRoleError(r.error ?? "Erro");
                return;
            }
            router.refresh();
            onRequestClose();
        });
    }

    function submitStatus(wantActive: boolean) {
        setStatusError(null);
        const fd = new FormData();
        fd.set("userId", user.id);
        fd.set("active", String(wantActive));
        startStatusTransition(async () => {
            const r = await setPortalUserActiveAction(fd);
            if (!r.success) {
                setStatusError(r.error ?? "Erro");
                return;
            }
            router.refresh();
            onRequestClose();
            setStatusError(null);
        });
    }

    function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setPwError(null);
        setPwFieldErrors({});
        setPwOk(false);
        startPwTransition(async () => {
            const r = await resetPortalUserPasswordAction(fd);
            if (r.success) {
                setPwOk(true);
                form.reset();
                setNewPassword("");
                router.refresh();
            } else {
                setPwError(r.error ?? null);
                setPwFieldErrors(r.fieldErrors ?? {});
            }
        });
    }

    return (
        <>
            <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="break-all text-left">
                        {user.email}
                    </DialogTitle>
                    {isActive ? (
                        <Badge
                            variant="secondary"
                            className="shrink-0 bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400"
                        >
                            Ativo
                        </Badge>
                    ) : (
                        <Badge variant="destructive" className="shrink-0">
                            Inativo
                        </Badge>
                    )}
                </div>
                <DialogDescription>
                    Inative ou reative o acesso ao portal e defina uma nova
                    senha quando necessário.
                </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
                {user.pending_setup && (
                    <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-50">
                        Esta conta ainda não tem senha definida. Informe uma senha
                        abaixo para liberar o acesso ao portal.
                    </p>
                )}

                <Separator />

                <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">
                        Papel nesta organização
                    </h3>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <div className="flex-1 space-y-2">
                            <Label htmlFor="modal-user-role">Papel</Label>
                            <Select
                                value={role}
                                onValueChange={(v) => setRole(v as OrganizationMemberRole)}
                                disabled={rolePending || !!isSelf}
                            >
                                <SelectTrigger id="modal-user-role">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">Usuário</SelectItem>
                                    <SelectItem value="admin">Administrador</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            disabled={
                                rolePending || !!isSelf || role === initialRole
                            }
                            onClick={submitRole}
                        >
                            {rolePending ? "Salvando…" : "Salvar papel"}
                        </Button>
                    </div>
                    {isSelf && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Você não pode alterar o seu próprio papel.
                        </p>
                    )}
                    {roleError && (
                        <p className="text-sm text-destructive mt-2">{roleError}</p>
                    )}
                </div>

                <Separator />

                <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">
                        Acesso ao sistema
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {isActive ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={statusPending || !!isSelf}
                                title={
                                    isSelf
                                        ? "Não é possível inativar a própria conta"
                                        : undefined
                                }
                                className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => submitStatus(false)}
                            >
                                {statusPending
                                    ? "Aplicando…"
                                    : "Inativar usuário"}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={statusPending}
                                className="border-green-600/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
                                onClick={() => submitStatus(true)}
                            >
                                {statusPending
                                    ? "Aplicando…"
                                    : "Reativar usuário"}
                            </Button>
                        )}
                    </div>
                    {isSelf && isActive && (
                        <p className="text-xs text-muted-foreground mt-2">
                            Você não pode inativar a sua própria conta enquanto
                            estiver logado.
                        </p>
                    )}
                    {statusError && (
                        <p className="text-sm text-destructive mt-2">
                            {statusError}
                        </p>
                    )}
                </div>

                <Separator />

                <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">
                        Nova senha
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        Mínimo 12 caracteres com letras maiúsculas e minúsculas,
                        número e símbolo. O usuário usará esta senha no próximo
                        login.
                    </p>
                    <form
                        onSubmit={handlePasswordSubmit}
                        className="space-y-3"
                    >
                        <input
                            type="hidden"
                            name="userId"
                            value={user.id}
                        />
                        <div className="space-y-2">
                            <Label htmlFor="modal-pw-new">Nova senha</Label>
                            <Input
                                id="modal-pw-new"
                                name="password"
                                type="password"
                                required
                                minLength={12}
                                autoComplete="new-password"
                                placeholder="Mín. 12 caracteres"
                                disabled={pwPending}
                                value={newPassword}
                                onChange={(e) =>
                                    setNewPassword(e.target.value)
                                }
                            />
                            <PasswordRequirementsHint password={newPassword} />
                            {pwFieldErrors.password &&
                                pwFieldErrors.password.length > 0 && (
                                    <ul className="text-xs text-destructive space-y-1 list-disc pl-4">
                                        {pwFieldErrors.password.map(
                                            (msg, i) => (
                                                <li key={i}>{msg}</li>
                                            ),
                                        )}
                                    </ul>
                                )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="modal-pw-confirm">
                                Confirmar senha
                            </Label>
                            <Input
                                id="modal-pw-confirm"
                                name="passwordConfirm"
                                type="password"
                                required
                                minLength={12}
                                autoComplete="new-password"
                                disabled={pwPending}
                            />
                            {pwFieldErrors.passwordConfirm?.[0] && (
                                <p className="text-xs text-destructive">
                                    {pwFieldErrors.passwordConfirm[0]}
                                </p>
                            )}
                        </div>
                        {pwError && (
                            <p className="text-sm text-destructive">{pwError}</p>
                        )}
                        {pwOk && (
                            <p className="text-sm text-green-600 dark:text-green-400">
                                Senha atualizada com sucesso.
                            </p>
                        )}
                        <Button
                            type="submit"
                            disabled={pwPending}
                            className="w-full sm:w-auto"
                        >
                            {pwPending ? "Salvando…" : "Salvar nova senha"}
                        </Button>
                    </form>
                </div>
            </div>
        </>
    );
}

export function ManagePortalUserDialog({
    user,
    sessionEmail,
    onOpenChange,
}: Props) {
    const open = user !== null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-md max-h-[90vh] overflow-y-auto"
                showCloseButton
            >
                {user && (
                    <ManagePortalUserPanel
                        key={user.id}
                        user={user}
                        sessionEmail={sessionEmail}
                        onRequestClose={() => onOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
