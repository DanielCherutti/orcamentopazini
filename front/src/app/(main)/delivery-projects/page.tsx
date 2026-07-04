import type { Metadata } from "next";
import Link from "next/link";
import { getDeliveryProjectsAction } from "@/actions/delivery-project-actions";
import { Badge } from "@/components/ui/badge";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { deliveryProjectUrl } from "@/lib/delivery/delivery-path";
import { getDeliveryProjectStatusLabel } from "@/lib/delivery/delivery-status";

export const metadata: Metadata = {
    title: "Projetos de entrega",
};

export default async function DeliveryProjectsPage({
    searchParams,
}: {
    searchParams: Promise<{ query?: string; page?: string }>;
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.query || "";
    const result = await getDeliveryProjectsAction({ page, query, limit: 20 });
    const projects = result.data ?? [];

    return (
        <DashboardPageShell
            title="Projetos de entrega"
            description="Documentação pós-aprovação: instalação, evidências e pacote técnico para o cliente."
        >
            <DashboardContentCard>
                {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        Nenhum projeto ainda. Abra um a partir de um orçamento{" "}
                        <strong>aprovado</strong>.
                    </p>
                ) : (
                    <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="text-left p-3 font-medium">Projeto</th>
                                    <th className="text-left p-3 font-medium">Orçamento</th>
                                    <th className="text-left p-3 font-medium hidden md:table-cell">Cliente</th>
                                    <th className="text-left p-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((p) => (
                                    <tr key={p.id} className="border-t hover:bg-muted/30">
                                        <td className="p-3">
                                            <Link
                                                href={deliveryProjectUrl(p.id!)}
                                                className="font-medium hover:underline"
                                            >
                                                {p.title}
                                            </Link>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {p.budget_code ?? "—"}
                                        </td>
                                        <td className="p-3 text-muted-foreground hidden md:table-cell">
                                            {p.client_name ?? "—"}
                                        </td>
                                        <td className="p-3">
                                            <Badge variant="outline">
                                                {getDeliveryProjectStatusLabel(p.status)}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </DashboardContentCard>
        </DashboardPageShell>
    );
}
