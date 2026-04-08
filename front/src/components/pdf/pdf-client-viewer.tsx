"use client";

import React, { useMemo } from 'react';
import { ProposalDocument } from './proposal-document';
import { PdfBlobPreviewFrame } from './pdf-blob-preview-frame';
import type { CompositorPdfPayload } from './compositor-pdf-types';
import type { Budget } from '@/types/budget-types';
import type { ProposalSettings } from '@/actions/settings-actions';

interface PdfClientViewerProps {
    budget: Budget;
    settings: ProposalSettings;
    compositorPdf?: CompositorPdfPayload;
}

export function PdfClientViewer({ budget, settings, compositorPdf }: PdfClientViewerProps) {
    const document = useMemo(
        () => (
            <ProposalDocument
                budget={budget}
                settings={settings}
                compositorPdf={compositorPdf}
            />
        ),
        [budget, settings, compositorPdf]
    );

    return (
        <div className="flex h-[calc(100vh-64px)] w-full flex-col bg-slate-100">
            <div className="flex items-center justify-between bg-white p-4 shadow">
                <h1 className="text-lg font-semibold">Visualização de PDF</h1>
                <span className="text-sm text-muted-foreground">O PDF é gerado em tempo real no cliente.</span>
            </div>
            <PdfBlobPreviewFrame document={document} className="min-h-0 flex-1" />
        </div>
    );
}
