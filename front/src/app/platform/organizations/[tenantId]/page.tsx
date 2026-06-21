import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
    getPlatformOrganizationAction,
    getPlatformOrganizationMetricsAction,
    listOrgMembersForPlatformAction,
} from "@/actions/platform-actions";
import {
    getTenantBillingProfileAction,
    listPlatformChargesAction,
} from "@/actions/platform-billing-actions";
import { listAuditLogAction, ensureAuditReadyAction } from "@/actions/audit-actions";
import { resolveTenantRef } from "@/actions/platform-helpers";
import { PlatformOrganizationDetail } from "@/components/platform/platform-organization-detail";
import { OrgAvatar } from "@/components/platform/platform-utils";
import { Button } from "@/components/ui/button";
import { getDb } from "@/lib/surreal";
import { recordIdToString } from "@/lib/surreal-record-ids";

type Props = {
    params: Promise<{ tenantId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { tenantId: orgRef } = await params;
    const org = await getPlatformOrganizationAction(orgRef);
    return {
        title: org.data?.name ?? "Organização",
    };
}

export default async function PlatformOrganizationPage({ params }: Props) {
    const { tenantId: orgRef } = await params;
    const org = await getPlatformOrganizationAction(orgRef);

    if (!org.success || !org.data) {
        return (
            <div className="p-8">
                <p className="text-destructive">{org.error ?? "Organização não encontrada."}</p>
                <Button variant="link" className="mt-4 px-0" asChild>
                    <Link href="/platform/organizations">Voltar às organizações</Link>
                </Button>
            </div>
        );
    }

    await ensureAuditReadyAction();
    const db = await getDb();
    const rid = await resolveTenantRef(db, orgRef);
    const tenantId = recordIdToString(rid)!;

    const [metricsRes, membersRes, billingProfileRes, chargesRes, auditRes] = await Promise.all([
        getPlatformOrganizationMetricsAction(orgRef),
        listOrgMembersForPlatformAction(orgRef),
        getTenantBillingProfileAction(orgRef),
        listPlatformChargesAction(orgRef),
        listAuditLogAction({ tenantId, limit: 50, offset: 0 }),
    ]);

    return (
        <div className="space-y-8 p-8">
            <header className="space-y-4">
                <Button variant="ghost" size="sm" className="-ml-2 h-8 gap-1.5 text-muted-foreground" asChild>
                    <Link href="/platform/organizations">
                        <ArrowLeft className="size-4" />
                        Organizações
                    </Link>
                </Button>
                <div className="flex items-start gap-4">
                    <OrgAvatar name={org.data.name} size="lg" />
                    <div className="min-w-0 flex-1 space-y-1">
                        <h1 className="text-3xl font-bold tracking-tight truncate">
                            {org.data.name}
                        </h1>
                        <p className="text-muted-foreground">
                            Configure licença, cobrança, acesso e aparência desta empresa cliente.
                        </p>
                    </div>
                </div>
            </header>
            <PlatformOrganizationDetail
                organization={org.data}
                metrics={metricsRes.data}
                members={membersRes.data ?? []}
                billingProfile={billingProfileRes.data}
                charges={chargesRes.data ?? []}
                auditEntries={auditRes.data ?? []}
                auditTotal={auditRes.total ?? 0}
            />
        </div>
    );
}
