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
import { toast } from "@/lib/toast";

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

    function handleOpenChange(next: boolean) {
        if (!next) {
            setError(null);
            setFieldErrors({});
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
                    <DialogTitle>Novo usuário</DialogTitle>
                    <DialogDescription>
                        Informe apenas o e-mail. Enviaremos um link para a pessoa
                        criar a senha e acessar o portal (válido por 48 horas).
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
                            {pending ? "Enviando…" : "Enviar convite"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
