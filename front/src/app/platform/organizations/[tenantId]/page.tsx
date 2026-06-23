import type { Metadata } from "next";
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
import { PlatformPageShell } from "@/components/layout/platform-page-shell";
import { PlatformPageError } from "@/components/layout/page-error-alert";
import { PlatformOrganizationDetail } from "@/components/platform/platform-organization-detail";
import { OrgAvatar } from "@/components/platform/platform-utils";
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
            <PlatformPageError
                pageTitle="Organização"
                message={org.error ?? "Organização não encontrada."}
                backLink={{ href: "/platform/organizations", label: "Organizações" }}
            />
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
        <PlatformPageShell
            eyebrow="Revenda"
            title={org.data.name}
            description="Configure licença, cobrança, acesso e aparência desta empresa cliente."
            titleLeading={<OrgAvatar name={org.data.name} size="lg" className="shrink-0" />}
            breadcrumbs={[
                { href: "/platform", label: "Mission Control" },
                { href: "/platform/organizations", label: "Organizações" },
                { label: org.data.name },
            ]}
            maxWidth="full"
        >
            <PlatformOrganizationDetail
                organization={org.data}
                metrics={metricsRes.data}
                members={membersRes.data ?? []}
                billingProfile={billingProfileRes.data}
                charges={chargesRes.data ?? []}
                auditEntries={auditRes.data ?? []}
                auditTotal={auditRes.total ?? 0}
            />
        </PlatformPageShell>
    );
}
