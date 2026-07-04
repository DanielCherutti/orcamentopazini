import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getTechnicalEquipmentsAction } from "@/actions/technical-equipment-actions";
import { Button } from "@/components/ui/button";
import { DashboardContentCard, DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { TechnicalEquipmentTable } from "@/components/technical-equipment/technical-equipment-table";

export const metadata: Metadata = {
    title: "Equipamentos técnicos",
};

export default async function TechnicalEquipmentPage({
    searchParams,
}: {
    searchParams: Promise<{ query?: string; page?: string }>;
}) {
    const params = await searchParams;
    const page = Number(params.page) || 1;
    const query = params.query || "";
    const result = await getTechnicalEquipmentsAction({ page, query, limit: 20 });
    const items = result.data ?? [];
    const meta = result.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 };

    return (
        <DashboardPageShell
            title="Equipamentos técnicos"
            description="Catálogo de equipamentos instalados com manual do fabricante para o pacote de entrega."
            action={
                <Button asChild className="rounded-lg shadow-sm">
                    <Link href="/dashboard/technical-equipment/new">
                        <Plus className="mr-2 h-4 w-4" />
                        Novo equipamento
                    </Link>
                </Button>
            }
        >
            <DashboardContentCard>
                <TechnicalEquipmentTable initialItems={items} initialMeta={meta} query={query} />
            </DashboardContentCard>
        </DashboardPageShell>
    );
}
