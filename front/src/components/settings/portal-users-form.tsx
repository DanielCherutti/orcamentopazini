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
    tenantName,
}: {
    users: PortalUserPublic[];
    sessionEmail: string | null;
    tenantName?: string | null;
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
                            {tenantName
                                ? `Usuários com acesso à organização ${tenantName}.`
                                : "Usuários com acesso à organização ativa."}{" "}
                            {users.length === 0
                                ? "Nenhum usuário ainda."
                                : `${users.length} usuário${users.length === 1 ? "" : "s"}.`}
                        </p>
                    </div>
                    <Button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        className="shrink-0"
                    >
                        <UserPlus className="size-4" />
                        Criar usuário
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
