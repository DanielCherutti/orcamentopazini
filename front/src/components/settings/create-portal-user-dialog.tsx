"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitCreatePortalUser } from "@/actions/portal-user-actions";
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

    function handleOpenChange(next: boolean) {
        if (!next) {
            setError(null);
            setFieldErrors({});
            setRole("user");
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
                toast.success(
                    r.message ??
                        "Convite enviado. A pessoa deve abrir o link no e-mail para criar a senha.",
                );
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
                    <DialogTitle>Convidar usuário</DialogTitle>
                    <DialogDescription>
                        O convite vincula a pessoa à organização ativa. Ela receberá um link
                        para criar a senha (válido por 48 horas).
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
                            {pending ? "Enviando…" : "Enviar convite"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
