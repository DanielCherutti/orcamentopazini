import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import type { ProposalSettings } from "@/actions/settings-actions";
import {
    DeliveryDatabookPdfDocument,
    type DeliveryDatabookPdfPayload,
} from "@/components/pdf/delivery-databook-pdf-document";
import {
    collectDeliveryEvidenceImageUrls,
    embedDeliveryPdfImages,
} from "@/lib/delivery/delivery-evidence-pdf-embed";
import { loadDeliveryProjectExportPayload } from "@/lib/delivery/delivery-project-export-payload";
import { safeDownloadFilename } from "@/lib/delivery/delivery-upload-files";

export type GenerateDeliveryDatabookPdfResult =
    | { ok: true; buffer: Buffer; filename: string }
    | { ok: false; status: number; error: string };

export async function generateDeliveryDatabookPdfBuffer(
    rawProjectId: string,
    options?: { pdfRequestOrigin?: string },
): Promise<GenerateDeliveryDatabookPdfResult> {
    const loaded = await loadDeliveryProjectExportPayload(rawProjectId);
    if (!loaded.ok) {
        return { ok: false, status: loaded.status, error: loaded.error };
    }

    const settingsRes = await getProposalSettingsAction();
    if (!settingsRes.success || !settingsRes.data) {
        return {
            ok: false,
            status: 500,
            error: settingsRes.error || "Erro ao carregar configurações",
        };
    }

    const pdfRequestOrigin = options?.pdfRequestOrigin?.trim().replace(/\/$/, "");
    const publicBase =
        settingsRes.data.app_public_url?.trim() || pdfRequestOrigin || undefined;
    const settings: ProposalSettings = {
        ...settingsRes.data,
        app_public_url: publicBase ?? settingsRes.data.app_public_url ?? "",
    };

    const { payload: exportPayload } = loaded;
    const generatedAt = new Date().toLocaleString("pt-BR");
    const pdfPayload: DeliveryDatabookPdfPayload = {
        project: exportPayload.project,
        areas: exportPayload.areas,
        evidenceByArea: exportPayload.evidenceByArea,
        installations: exportPayload.installations,
        generatedAt,
    };

    const imageUrls = [
        ...collectDeliveryEvidenceImageUrls(exportPayload.evidences),
        settings.company_logo_url ?? "",
    ].filter(Boolean);

    let pdfEmbeddedImages: Record<string, string> | undefined;
    try {
        const embedded = await embedDeliveryPdfImages(imageUrls, { publicBase });
        if (Object.keys(embedded).length > 0) {
            pdfEmbeddedImages = embedded;
        }
    } catch (embedErr) {
        console.error("generateDeliveryDatabookPdfBuffer: falha ao pré-carregar imagens:", embedErr);
    }

    try {
        const element = React.createElement(DeliveryDatabookPdfDocument, {
            payload: pdfPayload,
            settings,
            publicBase,
            ...(pdfEmbeddedImages ? { pdfEmbeddedImages } : {}),
        });
        const buffer = await renderToBuffer(
            element as Parameters<typeof renderToBuffer>[0],
        );
        const slug = safeDownloadFilename(exportPayload.project.title || rawProjectId, 40);
        return {
            ok: true,
            buffer: Buffer.from(buffer),
            filename: `databook-${slug}.pdf`,
        };
    } catch (err) {
        console.error("generateDeliveryDatabookPdfBuffer:", err);
        return { ok: false, status: 500, error: "Erro ao gerar PDF do DataBook" };
    }
}
