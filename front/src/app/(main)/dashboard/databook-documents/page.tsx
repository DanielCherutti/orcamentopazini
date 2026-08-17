import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { listDatabooksAction } from "@/actions/databook-actions";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { Button } from "@/components/ui/button";
import { DatabookDocumentsTable } from "@/components/databooks/databook-documents-table";

export const metadata: Metadata = { title: "DataBooks" };

export default async function DatabookDocumentsPage() {
    const result = await listDatabooksAction();
    const documents = result.data ?? [];
    return (
        <DashboardPageShell
            title="DataBooks"
            description="Laudos técnicos e relatórios das instalações."
            action={<Button asChild><Link href="/dashboard/databook-documents/new"><Plus className="mr-2 h-4 w-4" />Novo DataBook</Link></Button>}
        >
            <DashboardContentCard>
                <DatabookDocumentsTable documents={documents} />
            </DashboardContentCard>
        </DashboardPageShell>
    );
}
