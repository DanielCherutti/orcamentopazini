import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDeliveryProjectDetailAction } from "@/actions/delivery-project-actions";
import { listTechnicalEquipmentsForSelectAction } from "@/actions/technical-equipment-actions";
import { DeliveryProjectWorkspace } from "@/components/delivery/delivery-project-workspace";
import { Button } from "@/components/ui/button";
import {
    deliveryProjectIdFromPath,
    deliveryProjectIdToPath,
    deliveryProjectUrl,
} from "@/lib/delivery/delivery-path";

export const dynamic = "force-dynamic";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    const projectId = deliveryProjectIdFromPath(id);
    const res = await getDeliveryProjectDetailAction(projectId);
    return {
        title: res.data?.project.title ?? "Projeto de entrega",
    };
}

export default async function DeliveryProjectPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id: rawId } = await params;
    const decoded = decodeURIComponent(rawId);

    if (decoded.includes(":") || decoded.startsWith("delivery_project_")) {
        redirect(deliveryProjectUrl(decoded));
    }

    const projectId = deliveryProjectIdFromPath(rawId);
    const [detailRes, equipmentOptions] = await Promise.all([
        getDeliveryProjectDetailAction(projectId),
        listTechnicalEquipmentsForSelectAction(),
    ]);

    const canonicalPath = deliveryProjectIdToPath(projectId);
    if (decoded !== canonicalPath) {
        redirect(deliveryProjectUrl(projectId));
    }

    if (!detailRes.success || !detailRes.data) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
                <h1 className="text-xl font-semibold">Projeto de entrega não encontrado</h1>
                <p className="max-w-md text-sm text-muted-foreground">
                    {detailRes.error ??
                        "Não foi possível carregar este projeto. Verifique se você está na organização correta."}
                </p>
                <Button asChild variant="outline">
                    <Link href="/delivery-projects">Voltar para projetos</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="h-[calc(100dvh-var(--support-banner-height,0px)-var(--header-offset,0px))] min-h-0 flex flex-col">
            <DeliveryProjectWorkspace
                initial={detailRes.data}
                equipmentOptions={equipmentOptions}
            />
        </div>
    );
}
