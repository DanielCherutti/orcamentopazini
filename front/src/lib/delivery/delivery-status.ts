import type { DeliveryAreaStatus, DeliveryProjectStatus } from "@/types/delivery-types";

export function getDeliveryProjectStatusLabel(status: DeliveryProjectStatus | string): string {
    const labels: Record<string, string> = {
        planning: "Planejamento",
        installing: "Em instalação",
        documentation: "Documentação",
        review: "Revisão",
        delivered: "Entregue",
    };
    return labels[status] ?? status;
}

export function getDeliveryAreaStatusLabel(status: DeliveryAreaStatus | string): string {
    const labels: Record<string, string> = {
        pending: "Pendente",
        in_progress: "Em andamento",
        done: "Concluída",
    };
    return labels[status] ?? status;
}

export function getDeliveryEvidenceKindLabel(kind: string): string {
    const labels: Record<string, string> = {
        photo_before: "Foto — antes",
        photo_during: "Foto — durante",
        photo_after: "Foto — depois",
        document: "Documento",
        other: "Outro",
    };
    return labels[kind] ?? kind;
}
