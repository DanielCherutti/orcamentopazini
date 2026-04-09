import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { ProposalDocument } from "@/components/pdf/proposal-document";
import { loadBudgetPdfPayload } from "@/lib/budgets/budget-pdf-payload";
import {
    buildPdfEmbeddedImagesMap,
    collectRawPdfImageUrlsForPdf,
} from "@/lib/pdf/pdf-embed-images-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const pdfRequestOrigin = new URL(request.url).origin;
    const loaded = await loadBudgetPdfPayload(id, { pdfRequestOrigin });
    if (!loaded.ok) {
        return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    try {
        const imagePublicBase =
            loaded.settings.app_public_url?.trim() || pdfRequestOrigin || undefined;
        const pdfEmbeddedImages = await buildPdfEmbeddedImagesMap(
            collectRawPdfImageUrlsForPdf(loaded.budget, loaded.compositorPdf),
            imagePublicBase,
        );
        const element = React.createElement(ProposalDocument, {
            budget: loaded.budget,
            settings: loaded.settings,
            compositorPdf: loaded.compositorPdf,
            omitDocumentWatermark: process.env.PDF_OMIT_DOC_WATERMARK === "1",
            pdfEmbeddedImages,
        });
        // renderToBuffer tipa a raiz como <Document>; ProposalDocument encapsula <Document>.
        const buffer = await renderToBuffer(
            element as Parameters<typeof renderToBuffer>[0]
        );
        const code = loaded.budget.code?.trim() || "proposta";
        const safeFile = code.replace(/[^\w.-]+/g, "_").slice(0, 80) || "proposta";
        const filename = `proposta-${safeFile}.pdf`;

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${filename}"`,
                "Cache-Control": "private, no-store",
            },
        });
    } catch (e) {
        console.error("budget pdf route render error:", e);
        const detail =
            process.env.NODE_ENV === "development" && e instanceof Error ? e.message : undefined;
        return NextResponse.json(
            { error: "Falha ao gerar PDF", ...(detail ? { detail } : {}) },
            { status: 500 }
        );
    }
}
