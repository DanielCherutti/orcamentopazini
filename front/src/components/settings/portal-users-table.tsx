"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PortalUserPublic } from "@/actions/portal-user-actions";
import {
    resetPortalUserPasswordAction,
    setPortalUserActiveAction,
} from "@/actions/portal-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

function PortalUserPasswordForm({ userId }: { userId: string }) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
        {},
    );
    const [ok, setOk] = useState(false);
    const [pending, startTransition] = useTransition();

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        setError(null);
        setFieldErrors({});
        setOk(false);
        startTransition(async () => {
            const r = await resetPortalUserPasswordAction(fd);
            if (r.success) {
                setOk(true);
                form.reset();
                router.refresh();
            } else {
                setError(r.error ?? null);
                setFieldErrors(r.fieldErrors ?? {});
            }
        });
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3 max-w-sm pt-2">
            <input type="hidden" name="userId" value={userId} />
            <div className="space-y-1">
                <label
                    htmlFor={`np-${userId}`}
                    className="text-xs font-medium text-foreground"
                >
                    Nova senha
                </label>
                <input
                    id={`np-${userId}`}
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-2 py-1.5 text-sm border border-input bg-background rounded-md"
                />
                {fieldErrors.password?.[0] && (
                    <p className="text-xs text-destructive">
                        {fieldErrors.password[0]}
                    </p>
                )}
            </div>
            <div className="space-y-1">
                <label
                    htmlFor={`npc-${userId}`}
                    className="text-xs font-medium text-foreground"
                >
                    Confirmar senha
                </label>
                <input
                    id={`npc-${userId}`}
                    name="passwordConfirm"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="w-full px-2 py-1.5 text-sm border border-input bg-background rounded-md"
                />
                {fieldErrors.passwordConfirm?.[0] && (
                    <p className="text-xs text-destructive">
                        {fieldErrors.passwordConfirm[0]}
                    </p>
                )}
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {ok && (
                <p className="text-xs text-green-600 dark:text-green-400">
                    Senha atualizada.
                </p>
            )}
            <Button type="submit" size="sm" disabled={pending} variant="secondary">
                {pending ? "Salvando…" : "Salvar nova senha"}
            </Button>
        </form>
    );
}

function ActiveToggle({
    user,
    sessionEmail,
}: {
    user: PortalUserPublic;
    sessionEmail: string | null;
}) {
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [pending, startTransition] = useTransition();

    const isSelf =
        sessionEmail &&
        user.email.trim().toLowerCase() === sessionEmail.trim().toLowerCase();
    const isActive = user.active !== false;

    function submit(wantActive: boolean) {
        setError(null);
        const fd = new FormData();
        fd.set("userId", user.id);
        fd.set("active", String(wantActive));
        startTransition(async () => {
            const r = await setPortalUserActiveAction(fd);
            if (!r.success) {
                setError(r.error ?? "Erro");
                return;
            }
            router.refresh();
        });
    }

    return (
        <div className="flex flex-col gap-1.5 items-start">
            {isActive ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending || !!isSelf}
                    onClick={() => submit(false)}
                    title={
                        isSelf
                            ? "Não é possível inativar a própria conta"
                            : undefined
                    }
                    className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                >
                    Inativar
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => submit(true)}
                    className="border-green-600/40 text-green-700 hover:bg-green-500/10 dark:text-green-400"
                >
                    Reativar
                </Button>
            )}
            {error && (
                <p className="text-xs text-destructive max-w-[220px] whitespace-normal">
                    {error}
                </p>
            )}
        </div>
    );
}

export function PortalUsersTable({
    users,
    sessionEmail,
}: {
    users: PortalUserPublic[];
    sessionEmail: string | null;
}) {
    if (users.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Nenhum usuário cadastrado. Use{" "}
                    <strong className="text-foreground">Cadastrar usuário</strong>{" "}
                    ou rode no terminal{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        bun run seed:portal-user
                    </code>{" "}
                    (com as variáveis no <code className="text-xs">.env</code>).
                </p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[200px]">E-mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[140px]">Conta</TableHead>
                    <TableHead className="min-w-[200px] whitespace-normal">
                        Senha
                    </TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {users.map((u) => (
                    <TableRow key={u.id} className="align-top">
                        <TableCell className="font-medium whitespace-normal">
                            {u.email}
                        </TableCell>
                        <TableCell>
                            {u.active === false ? (
                                <Badge variant="destructive">Inativo</Badge>
                            ) : (
                                <Badge
                                    variant="secondary"
                                    className="bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400"
                                >
                                    Ativo
                                </Badge>
                            )}
                        </TableCell>
                        <TableCell className="whitespace-normal">
                            <ActiveToggle
                                user={u}
                                sessionEmail={sessionEmail}
                            />
                        </TableCell>
                        <TableCell className="whitespace-normal">
                            <details className="group">
                                <summary className="cursor-pointer text-sm text-primary hover:underline list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1">
                                    Alterar senha
                                    <span className="text-muted-foreground transition-transform group-open:rotate-90">
                                        ›
                                    </span>
                                </summary>
                                <PortalUserPasswordForm userId={u.id} />
                            </details>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
