import { DatabookDocumentForm } from "@/components/databooks/databook-document-form";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";

export default function NewDatabookDocumentPage() {
    return (
        <DashboardPageShell title="Novo DataBook" description="Crie um documento técnico obrigatoriamente vinculado a um cliente.">
            <DashboardContentCard><DatabookDocumentForm /></DashboardContentCard>
        </DashboardPageShell>
    );
}
