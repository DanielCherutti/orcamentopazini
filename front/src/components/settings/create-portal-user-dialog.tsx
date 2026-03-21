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

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

export function CreatePortalUserDialog({ open, onOpenChange }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
        {},
    );
    const [password, setPassword] = useState("");

    function handleOpenChange(next: boolean) {
        if (!next) {
            setError(null);
            setFieldErrors({});
            setPassword("");
        }
        onOpenChange(next);
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        setFieldErrors({});

        startTransition(async () => {
            const r = await submitCreatePortalUser(fd);
            if (r.success) {
                form.reset();
                setPassword("");
                handleOpenChange(false);
                router.refresh();
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
                    <DialogTitle>Novo usuário</DialogTitle>
                    <DialogDescription>
                        O e-mail será usado no login. Defina uma senha forte
                        conforme os requisitos abaixo.
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
                            <p className="text-sm text-destructive">
                                {fieldErrors.email[0]}
                            </p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="portal-new-password">Senha</Label>
                        <Input
                            id="portal-new-password"
                            name="password"
                            type="password"
                            required
                            minLength={12}
                            autoComplete="new-password"
                            placeholder="Senha forte (mín. 12 caracteres)"
                            disabled={pending}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <PasswordRequirementsHint password={password} />
                        {fieldErrors.password && fieldErrors.password.length > 0 && (
                            <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
                                {fieldErrors.password.map((msg, i) => (
                                    <li key={i}>{msg}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {error && (
                        <p className="text-sm text-destructive">{error}</p>
                    )}
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
                            {pending ? "Cadastrando…" : "Cadastrar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
