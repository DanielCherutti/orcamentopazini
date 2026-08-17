"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PortalUserPublic } from "@/actions/portal-user-actions";
import { deletePortalUserAction } from "@/actions/portal-user-actions";
import { ManagePortalUserDialog } from "@/components/settings/manage-portal-user-dialog";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { ChevronRight, Trash2 } from "lucide-react";

export function PortalUsersTable({
    users,
    sessionEmail,
}: {
    users: PortalUserPublic[];
    sessionEmail: string | null;
}) {
    const router = useRouter();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<PortalUserPublic | null>(
        null,
    );
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [deletePending, startDeleteTransition] = useTransition();

    const selectedUser =
        selectedId === null
            ? null
            : (users.find((u) => u.id === selectedId) ?? null);

    function isSelf(u: PortalUserPublic): boolean {
        return (
            !!sessionEmail &&
            u.email.trim().toLowerCase() ===
                sessionEmail.trim().toLowerCase()
        );
    }

    function handleDeleteDialogChange(open: boolean) {
        if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
        }
    }

    function confirmDelete() {
        if (!deleteTarget) return;
        setDeleteError(null);
        const id = deleteTarget.id;
        const fd = new FormData();
        fd.set("userId", id);
        startDeleteTransition(async () => {
            const r = await deletePortalUserAction(fd);
            if (r.success) {
                if (selectedId === id) setSelectedId(null);
                setDeleteTarget(null);
                setDeleteError(null);
                router.refresh();
                return;
            }
            setDeleteError(r.error ?? "Erro ao remover");
        });
    }

    if (users.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-6 py-10 text-center">
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                    Nenhum usuário cadastrado. Use{" "}
                    <strong className="text-foreground">Criar usuário</strong>{" "}
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
        <>
            <p className="text-xs text-muted-foreground mb-3">
                Clique na linha para gerenciar acesso e senha. Convites pendentes
                aguardam o link no e-mail. Use o ícone da lixeira para excluir.
            </p>
            <Table>
                <TableHeader>
                    <TableRow className="hover:bg-transparent">
                        <TableHead className="min-w-[220px]">E-mail</TableHead>
                        <TableHead>Papel</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[88px] text-right pr-2">
                            <span className="sr-only">Ações</span>
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.map((u) => {
                        const self = isSelf(u);
                        return (
                            <TableRow
                                key={u.id}
                                role="button"
                                tabIndex={0}
                                aria-label={`Gerenciar usuário ${u.email}`}
                                className="cursor-pointer hover:bg-muted/60 data-[state=selected]:bg-muted/40"
                                data-state={
                                    selectedId === u.id ? "selected" : undefined
                                }
                                onClick={() => setSelectedId(u.id)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        setSelectedId(u.id);
                                    }
                                }}
                            >
                                <TableCell className="font-medium whitespace-normal py-3">
                                    {u.email}
                                </TableCell>
                                <TableCell className="py-3">
                                    <Badge variant="outline" className="capitalize">
                                        {u.tenant_role ?? "user"}
                                    </Badge>
                                </TableCell>
                                <TableCell className="py-3">
                                    <div className="flex flex-wrap gap-1.5">
                                        {u.active === false ? (
                                            <Badge variant="destructive">
                                                Inativo
                                            </Badge>
                                        ) : (
                                            <Badge
                                                variant="secondary"
                                                className="bg-green-500/15 text-green-700 border-green-500/30"
                                            >
                                                Ativo
                                            </Badge>
                                        )}
                                        {u.pending_setup && (
                                            <Badge
                                                variant="outline"
                                                className="border-amber-500/50 text-amber-800"
                                            >
                                                Convite pendente
                                            </Badge>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell
                                    className="py-3 pr-1"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-end gap-0.5">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                                            disabled={self}
                                            title={
                                                self
                                                    ? "Você não pode remover a sua própria conta"
                                                    : `Excluir ${u.email}`
                                            }
                                            aria-label={`Excluir usuário ${u.email}`}
                                            onClick={() => {
                                                setDeleteError(null);
                                                setDeleteTarget(u);
                                            }}
                                        >
                                            <Trash2 className="size-4" />
                                        </Button>
                                        <span className="inline-flex size-8 items-center justify-center text-muted-foreground pointer-events-none">
                                            <ChevronRight className="size-4 opacity-60" />
                                        </span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            <AlertDialog
                open={deleteTarget !== null}
                onOpenChange={handleDeleteDialogChange}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover usuário?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <span>
                                O acesso de{" "}
                                <strong className="text-foreground">
                                    {deleteTarget?.email}
                                </strong>{" "}
                                será removido desta organização. A conta global pode
                                continuar existindo se pertencer a outras organizações.
                            </span>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteError ? (
                        <p className="text-sm text-destructive">{deleteError}</p>
                    ) : null}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletePending}>
                            Cancelar
                        </AlertDialogCancel>
                        <Button
                            type="button"
                            variant="destructive"
                            disabled={deletePending}
                            onClick={confirmDelete}
                        >
                            {deletePending ? "Removendo…" : "Remover"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <ManagePortalUserDialog
                user={selectedUser}
                sessionEmail={sessionEmail}
                onOpenChange={(open) => {
                    if (!open) setSelectedId(null);
                }}
            />
        </>
    );
}
