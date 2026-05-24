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

        const paginationCollector: ProposalPaginationCollector = { segmentStartPages: {} };
        const firstPassElement = React.createElement(ProposalDocument, {
            budget: loaded.budget,
            settings: settingsForPdf,
            compositorPdf: loaded.compositorPdf,
            omitDocumentWatermark: process.env.PDF_OMIT_DOC_WATERMARK === "1",
            paginationCollector,
            ...(pdfEmbeddedImages && Object.keys(pdfEmbeddedImages).length > 0
                ? { pdfEmbeddedImages }
                : {}),
        });
        await renderToBuffer(firstPassElement as Parameters<typeof renderToBuffer>[0]);

        const resolvedPagination: ProposalResolvedPagination = {
            segmentStartPages: paginationCollector.segmentStartPages,
        };
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
        const code = loaded.budget.code?.trim() || "proposta";
        const safeFile = code.replace(/[^\w.-]+/g, "_").slice(0, 80) || "proposta";
        const filename = `proposta-${safeFile}.pdf`;

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
