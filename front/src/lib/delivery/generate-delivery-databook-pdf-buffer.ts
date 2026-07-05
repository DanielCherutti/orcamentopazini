import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import {
    DeliveryDatabookPdfDocument,
    type DeliveryDatabookPdfPayload,
} from "@/components/pdf/delivery-databook-pdf-document";
import {
    collectDeliveryEvidenceImageUrls,
    embedDeliveryPdfImages,
} from "@/lib/delivery/delivery-evidence-pdf-embed";
import { loadDeliveryProjectExportPayload } from "@/lib/delivery/delivery-project-export-payload";
import { loadDeliveryCompositorPdfPayload } from "@/lib/delivery/load-delivery-compositor-pdf-payload";
import { safeDownloadFilename } from "@/lib/delivery/delivery-upload-files";
import {
    buildPdfEmbeddedImagesMap,
    collectRawPdfImageUrlsForPdf,
} from "@/lib/pdf/pdf-embed-images-server";

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

    const compositorLoaded = await loadDeliveryCompositorPdfPayload(rawProjectId, options);
    if (!compositorLoaded.ok) {
        return { ok: false, status: compositorLoaded.status, error: compositorLoaded.error };
    }

    const { settings, compositorPdf, budgetShell } = compositorLoaded;
    const publicBase = settings.app_public_url?.trim() || options?.pdfRequestOrigin || undefined;

    const generatedAt = new Date().toLocaleString("pt-BR");
    const pdfPayload: DeliveryDatabookPdfPayload = {
        project: loaded.payload.project,
        areas: loaded.payload.areas,
        evidenceByArea: loaded.payload.evidenceByArea,
        installations: loaded.payload.installations,
        generatedAt,
    };

    const compositorUrls = collectRawPdfImageUrlsForPdf(budgetShell, compositorPdf, settings);
    const evidenceUrls = collectDeliveryEvidenceImageUrls(loaded.payload.evidences);
    const allUrls = [...compositorUrls, ...evidenceUrls, settings.company_logo_url ?? ""].filter(
        Boolean,
    );

    let pdfEmbeddedImages: Record<string, string> | undefined;
    try {
        const fromCompositor = await buildPdfEmbeddedImagesMap(allUrls, publicBase);
        const fromUploads = await embedDeliveryPdfImages(evidenceUrls, { publicBase });
        const merged = { ...fromCompositor, ...fromUploads };
        if (Object.keys(merged).length > 0) {
            pdfEmbeddedImages = merged;
        }
    } catch (embedErr) {
        console.error("generateDeliveryDatabookPdfBuffer: falha ao pré-carregar imagens:", embedErr);
    }

    try {
        const element = React.createElement(DeliveryDatabookPdfDocument, {
            payload: pdfPayload,
            budget: budgetShell,
            settings,
            compositorPdf,
            ...(pdfEmbeddedImages ? { pdfEmbeddedImages } : {}),
        });
        const buffer = await renderToBuffer(
            element as Parameters<typeof renderToBuffer>[0],
        );
        const slug = safeDownloadFilename(loaded.payload.project.title || rawProjectId, 40);
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
