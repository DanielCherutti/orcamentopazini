import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { getDatabookAction } from "@/actions/databook-actions";
import { listDatabookInstallationsAction } from "@/actions/databook-content-actions";
import { DatabookPdfDocument, type DatabookPagination } from "@/components/pdf/databook-document";
import { consolidateManuals } from "@/lib/databooks/domain";
import { readUploadFile } from "@/lib/delivery/delivery-upload-files";
import type { ProductManual } from "@/types/databook-types";
import { loadDeliveryCompositorPdfPayload } from "@/lib/delivery/load-delivery-compositor-pdf-payload";
import { listDatabookMediaAction } from "@/actions/databook-media-actions";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
const PAGE_SIZE_TOLERANCE_PT = 0.5;

function assertAllPagesArePortraitA4(document: PDFDocument) {
    document.getPages().forEach((page, index) => {
        const { width, height } = page.getSize();
        const isA4 =
            Math.abs(width - A4_WIDTH_PT) <= PAGE_SIZE_TOLERANCE_PT
            && Math.abs(height - A4_HEIGHT_PT) <= PAGE_SIZE_TOLERANCE_PT;
        if (!isA4) {
            throw new Error(
                `Página ${index + 1} fora do padrão A4 retrato: ${width.toFixed(2)} × ${height.toFixed(2)} pt`,
            );
        }
    });
}

export async function generateDatabookPdf(databookId: string) {
    const [bookResult, installationsResult, compositorResult, mediaResult] = await Promise.all([
        getDatabookAction(databookId),
        listDatabookInstallationsAction(databookId),
        loadDeliveryCompositorPdfPayload(databookId),
        listDatabookMediaAction(databookId),
    ]);
    if (!bookResult.success || !bookResult.data) return { ok: false as const, status: 404, error: bookResult.error ?? "DataBook não encontrado" };
    if (!installationsResult.success) return { ok: false as const, status: 400, error: installationsResult.error ?? "Instalações inválidas" };
    const book = bookResult.data;
    const installations = structuredClone(installationsResult.data ?? []);
    const media = structuredClone(mediaResult.data ?? []);
    for (const item of media) {
        const bytes = await readUploadFile(item.file_url);
        if (bytes) item.embedded_src = `data:${item.mime_type};base64,${bytes.toString("base64")}`;
    }
    const manuals = consolidateManuals(installations.flatMap((installation) => installation.products.flatMap((item) => {
        const raw = item.manual_reference_snapshot;
        if (!raw?.id || !raw.file_url) return [];
        return [{
            id: String(raw.id), product_id: item.product_id, title: String(raw.title ?? "Manual"),
            file_url: String(raw.file_url), filename: String(raw.filename ?? "manual.pdf"),
            mime_type: "application/pdf" as const, authorship: raw.authorship === "external" ? "external" as const : "internal" as const,
            edition: raw.edition ? String(raw.edition) : undefined, active: true,
        } satisfies ProductManual];
    })));
    const references = new Map(manuals.map((manual) => [manual.id, manual.reference]));
    installations.forEach((installation) => installation.products.forEach((item) => {
        if (item.manual_reference_snapshot?.id) {
            item.manual_reference_snapshot.reference = references.get(String(item.manual_reference_snapshot.id)) ?? "";
        }
    }));
    const commonProps = {
        book,
        installations,
        media,
        ...(compositorResult.ok ? {
            settings: compositorResult.settings,
            budget: compositorResult.budgetShell,
            compositorPdf: compositorResult.compositorPdf,
        } : {}),
    };
    let resolvedPagination: DatabookPagination | undefined;
    // O sumário e a lista de figuras também podem ocupar mais de uma página.
    // Repaginamos até os marcadores estabilizarem, como na geração do orçamento.
    for (let pass = 0; pass < 3; pass += 1) {
        const paginationCollector: DatabookPagination = { segmentStartPages: {} };
        const probe = React.createElement(DatabookPdfDocument, {
            ...commonProps,
            paginationCollector,
            ...(resolvedPagination ? { resolvedPagination } : {}),
        });
        await renderToBuffer(probe as Parameters<typeof renderToBuffer>[0]);
        const next: DatabookPagination = {
            segmentStartPages: { ...paginationCollector.segmentStartPages },
        };
        if (resolvedPagination && JSON.stringify(resolvedPagination.segmentStartPages) === JSON.stringify(next.segmentStartPages)) {
            resolvedPagination = next;
            break;
        }
        resolvedPagination = next;
    }
    const element = React.createElement(DatabookPdfDocument, {
        ...commonProps,
        resolvedPagination,
    });
    const rendered = Buffer.from(await renderToBuffer(element as Parameters<typeof renderToBuffer>[0]));
    const output = await PDFDocument.load(rendered);
    for (const manual of manuals) {
        const bytes = await readUploadFile(manual.file_url);
        if (!bytes) continue;
        try {
            const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
            const sourcePages = source.getPages();
            const embeddedPages = await output.embedPdf(bytes, source.getPageIndices());
            embeddedPages.forEach((embeddedPage, index) => {
                const { width, height } = sourcePages[index].getSize();
                const scale = Math.min(A4_WIDTH_PT / width, A4_HEIGHT_PT / height);
                const drawWidth = width * scale;
                const drawHeight = height * scale;
                const page = output.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
                page.drawPage(embeddedPage, {
                    x: (A4_WIDTH_PT - drawWidth) / 2,
                    y: (A4_HEIGHT_PT - drawHeight) / 2,
                    width: drawWidth,
                    height: drawHeight,
                });
            });
        } catch (error) {
            console.error("generateDatabookPdf: manual inválido", manual.id, error);
        }
    }
    assertAllPagesArePortraitA4(output);
    const buffer = Buffer.from(await output.save());
    const filename = `databook-${book.code.replace(/[^a-z0-9_-]+/gi, "-")}.pdf`;
    return { ok: true as const, buffer, filename, pageCount: output.getPageCount(), manuals };
}
