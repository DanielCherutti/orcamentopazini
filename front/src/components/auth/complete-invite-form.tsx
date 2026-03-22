"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completePortalInviteAction } from "@/actions/portal-invite-actions";
import { PasswordRequirementsHint } from "@/components/settings/password-requirements-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock } from "lucide-react";

type Props = {
    token: string;
};

export function CompleteInviteForm({ token }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
        {},
    );
    const [password, setPassword] = useState("");

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        fd.set("token", token);
        setError(null);
        setFieldErrors({});

        startTransition(async () => {
            const r = await completePortalInviteAction(fd);
            if (r.success) {
                router.push("/?success=invite");
                return;
            }
            if (r.error) setError(r.error);
            if (r.fieldErrors) setFieldErrors(r.fieldErrors);
        });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="token" value={token} readOnly />
            <div className="space-y-2">
                <Label htmlFor="invite-password">Nova senha</Label>
                <div className="relative">
                    <Lock
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <Input
                        id="invite-password"
                        name="password"
                        type="password"
                        required
                        minLength={12}
                        autoComplete="new-password"
                        placeholder="Mín. 12 caracteres"
                        disabled={pending}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                    />
                </div>
                <PasswordRequirementsHint password={password} />
                {fieldErrors.password && fieldErrors.password.length > 0 && (
                    <ul className="text-sm text-destructive space-y-1 list-disc pl-4">
                        {fieldErrors.password.map((msg, i) => (
                            <li key={i}>{msg}</li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="space-y-2">
                <Label htmlFor="invite-password-confirm">Confirmar senha</Label>
                <div className="relative">
                    <Lock
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                    />
                    <Input
                        id="invite-password-confirm"
                        name="passwordConfirm"
                        type="password"
                        required
                        minLength={12}
                        autoComplete="new-password"
                        placeholder="Repita a senha"
                        disabled={pending}
                        className="pl-10"
                    />
                </div>
                {fieldErrors.passwordConfirm?.[0] && (
                    <p className="text-sm text-destructive">
                        {fieldErrors.passwordConfirm[0]}
                    </p>
                )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Salvando…" : "Criar senha e concluir"}
            </Button>
        </form>
    );
}
