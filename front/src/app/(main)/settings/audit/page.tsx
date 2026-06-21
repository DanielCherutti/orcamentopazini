import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listTenantAuditLogAction, ensureAuditReadyAction } from "@/actions/audit-actions";
import { assertPortalAdminSession } from "@/lib/tenant-context";
import { AuditLogTable } from "@/components/platform/audit-log-table";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
    title: "Auditoria",
};

type Props = {
    searchParams: Promise<{ search?: string; action?: string }>;
};

export default async function SettingsAuditPage({ searchParams }: Props) {
    const auth = await assertPortalAdminSession();
    if (!auth.ok) redirect("/settings");

    await ensureAuditReadyAction();
    const sp = await searchParams;

    const audit = await listTenantAuditLogAction({
        search: sp.search,
        action: sp.action,
        limit: 100,
        offset: 0,
    });

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
                <p className="text-muted-foreground mt-1">
                    Registro de ações realizadas nesta organização.
                </p>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Histórico</CardTitle>
                    <CardDescription>Últimas operações de usuários e administradores.</CardDescription>
                </CardHeader>
                <CardContent>
                    {!audit.success ? (
                        <p className="text-destructive text-sm">{audit.error}</p>
                    ) : (
                        <AuditLogTable
                            entries={audit.data ?? []}
                            total={audit.total ?? 0}
                            basePath="/settings/audit"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
