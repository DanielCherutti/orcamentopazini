"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitCreatePortalUser } from "@/actions/portal-user-actions";
import { PasswordRequirementsHint } from "@/components/settings/password-requirements-hint";
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
import { toast } from "@/lib/toast";
import type { OrganizationMemberRole } from "@/types/tenant-types";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function CreatePortalUserDialog({ open, onOpenChange }: Props) {
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
            const r = await submitCreatePortalUser(fd);
            if (r.success) {
                form.reset();
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
                        Informe e-mail, senha e papel. Se o e-mail já existir no sistema, a pessoa
                        será apenas vinculada a esta organização.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="portal-new-email">E-mail</Label>
                        <Input
                            id="portal-new-email"
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
                        <Label htmlFor="portal-new-role">Papel nesta organização</Label>
                        <Select
                            value={role}
                            onValueChange={(v) =>
                                setRole(v as OrganizationMemberRole)
                            }
                            disabled={pending}
                        >
                            <SelectTrigger id="portal-new-role">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">Usuário</SelectItem>
                                <SelectItem value="admin">Administrador</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="portal-new-password">Senha inicial</Label>
                        <Input
                            id="portal-new-password"
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
                        <Label htmlFor="portal-new-password-confirm">Confirmar senha</Label>
                        <Input
                            id="portal-new-password-confirm"
                            name="passwordConfirm"
                            type="password"
                            required
                            autoComplete="new-password"
                            disabled={pending}
                        />
                        {fieldErrors.passwordConfirm?.[0] && (
                            <p className="text-sm text-destructive">
                                {fieldErrors.passwordConfirm[0]}
                            </p>
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
