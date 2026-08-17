import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { Document, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { Budget } from "@/types/budget-types";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import { CompositorCoverPdfPage } from "./compositor-cover-pdf";

const ONE_PIXEL_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("cover watermark does not create an extra blank page", async () => {
    const budget = {
        id: "budget:test",
        client_id: "customer:test",
        title: "Teste",
        code: "0001",
    } as Budget;
    const settings = { company_name: "Pazini" } as ProposalSettings;
    const coverProps = {
        cover_document_html: "<p>Conteúdo da capa</p>",
        cover_watermark_url: ONE_PIXEL_PNG,
        cover_watermark_opacity: 0.12,
    } as CoverBlockProps;

    const buffer = await renderToBuffer(
        <Document>
            <CompositorCoverPdfPage
                budget={budget}
                settings={settings}
                coverProps={coverProps}
            />
        </Document>,
    );
    const pdf = await PDFDocument.load(buffer);

    assert.equal(pdf.getPageCount(), 1);
});
