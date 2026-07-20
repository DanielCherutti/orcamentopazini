import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { ProposalSettings } from "@/actions/settings-actions";
import {
    ProposalDocument,
    type ProposalPaginationCollector,
    type ProposalResolvedPagination,
} from "@/components/pdf/proposal-document";
import { loadBudgetPdfPayload } from "@/lib/budgets/budget-pdf-payload";
import type { Budget } from "@/types/budget-types";
import {
    buildPdfEmbeddedImagesMap,
    collectRawPdfImageUrlsForPdf,
} from "@/lib/pdf/pdf-embed-images-server";
import { registerCompositorPdfFonts } from "@/lib/pdf/pdf-custom-fonts-server";
import { budgetPdfFilename } from "@/lib/pdf/pdf-filename";

export type GenerateBudgetPdfResult =
    | { ok: true; buffer: Buffer; filename: string; budget: Budget; settings: ProposalSettings }
    | { ok: false; status: number; error: string };

/**
 * Gera o PDF da proposta (mesmo conteúdo da aba Impressão / rota `/api/budgets/.../pdf`).
 */
export async function generateBudgetPdfBuffer(
    rawBudgetId: string,
    options?: { pdfRequestOrigin?: string }
): Promise<GenerateBudgetPdfResult> {
    const loaded = await loadBudgetPdfPayload(rawBudgetId, {
        pdfRequestOrigin: options?.pdfRequestOrigin,
    });
    if (!loaded.ok) {
        return { ok: false, status: loaded.status, error: loaded.error };
    }

    try {
        const pdfRequestOrigin = options?.pdfRequestOrigin?.trim().replace(/\/$/, "");
        const imagePublicBase =
            loaded.settings.app_public_url?.trim() || pdfRequestOrigin || undefined;
        const settingsForPdf: ProposalSettings = {
            ...loaded.settings,
            app_public_url: imagePublicBase ?? loaded.settings.app_public_url ?? "",
        };
        await registerCompositorPdfFonts(loaded.compositorPdf);

        let pdfEmbeddedImages: Record<string, string> | undefined;
        try {
            pdfEmbeddedImages = await buildPdfEmbeddedImagesMap(
                collectRawPdfImageUrlsForPdf(loaded.budget, loaded.compositorPdf, settingsForPdf),
                imagePublicBase,
            );
        } catch (embedErr) {
            console.error("generateBudgetPdfBuffer: falha ao pré-carregar imagens:", embedErr);
            pdfEmbeddedImages = undefined;
        }

        let resolvedPagination: ProposalResolvedPagination | undefined;
        // A Lista de Figuras também ocupa páginas e pode deslocar figuras. Repagina até o
        // mapa estabilizar, com limite curto para nunca criar um loop durante a exportação.
        for (let pass = 0; pass < 3; pass += 1) {
            const paginationCollector: ProposalPaginationCollector = { segmentStartPages: {} };
            const probeElement = React.createElement(ProposalDocument, {
                budget: loaded.budget,
                settings: settingsForPdf,
                compositorPdf: loaded.compositorPdf,
                omitDocumentWatermark: process.env.PDF_OMIT_DOC_WATERMARK === "1",
                paginationCollector,
                ...(resolvedPagination ? { resolvedPagination } : {}),
                ...(pdfEmbeddedImages && Object.keys(pdfEmbeddedImages).length > 0
                    ? { pdfEmbeddedImages }
                    : {}),
            });
            await renderToBuffer(probeElement as Parameters<typeof renderToBuffer>[0]);
            const next: ProposalResolvedPagination = {
                segmentStartPages: { ...paginationCollector.segmentStartPages },
            };
            if (resolvedPagination && paginationMapsEqual(
                resolvedPagination.segmentStartPages ?? {},
                next.segmentStartPages ?? {},
            )) {
                resolvedPagination = next;
                break;
            }
            resolvedPagination = next;
        }
        const element = React.createElement(ProposalDocument, {
            budget: loaded.budget,
            settings: settingsForPdf,
            compositorPdf: loaded.compositorPdf,
            omitDocumentWatermark: process.env.PDF_OMIT_DOC_WATERMARK === "1",
            resolvedPagination,
            ...(pdfEmbeddedImages && Object.keys(pdfEmbeddedImages).length > 0
                ? { pdfEmbeddedImages }
                : {}),
        });

        const buffer = await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]);
        const filename = budgetPdfFilename(loaded.budget.title);

        return {
            ok: true,
            buffer: Buffer.from(buffer),
            filename,
            budget: loaded.budget,
            settings: settingsForPdf,
        };
    } catch (e) {
        console.error("generateBudgetPdfBuffer:", e);
        const detail =
            process.env.NODE_ENV === "development" && e instanceof Error ? e.message : undefined;
        return {
            ok: false,
            status: 500,
            error: detail ? `Falha ao gerar PDF: ${detail}` : "Falha ao gerar PDF da proposta",
        };
    }
}

function paginationMapsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return aKeys.length === bKeys.length && aKeys.every((key) => a[key] === b[key]);
}
