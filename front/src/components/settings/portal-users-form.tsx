"use client";

import { useState } from "react";
import type { PortalUserPublic } from "@/actions/portal-user-actions";
import { CreatePortalUserDialog } from "@/components/settings/create-portal-user-dialog";
import { PortalUsersTable } from "@/components/settings/portal-users-table";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export function PortalUsersForm({
    users,
    sessionEmail,
}: {
    users: PortalUserPublic[];
    sessionEmail: string | null;
}) {
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <>
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="flex flex-col gap-4 border-b border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-foreground">
                            Lista de usuários
                        </h2>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            {users.length === 0
                                ? "Nenhum usuário cadastrado ainda."
                                : `${users.length} usuário${users.length === 1 ? "" : "s"} com acesso ao portal.`}
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="shrink-0"
                    >
                        <UserPlus className="size-4" />
                        Cadastrar usuário
                    </Button>
                </div>
                <div className="p-5">
                    <PortalUsersTable
                        users={users}
                        sessionEmail={sessionEmail}
                    />
                </div>
            </div>

            <CreatePortalUserDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
            />
        </>
    );
}
