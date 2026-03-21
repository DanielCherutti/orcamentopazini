"use client";

import React from 'react';
import dynamic from 'next/dynamic';
import { ProposalDocument } from './proposal-document';
import type { Budget } from '@/types/budget-types';
import type { ProposalSettings } from '@/actions/settings-actions';

// Import dinâmico do PDFViewer para evitar erros de SSR (window is not defined)
const PDFViewer = dynamic(
    () => import("@react-pdf/renderer").then((mod) => mod.PDFViewer),
    {
        ssr: false,
        loading: () => <div className="flex items-center justify-center h-screen">Carregando visualizador...</div>
    }
);

interface PdfClientViewerProps {
    budget: Budget;
    settings: ProposalSettings;
}

export function PdfClientViewer({ budget, settings }: PdfClientViewerProps) {
    return (
        <div className="w-full h-[calc(100vh-64px)] bg-slate-100 flex flex-col">
            <div className="p-4 bg-white shadow flex justify-between items-center">
                <h1 className="font-semibold text-lg">Visualização de PDF</h1>
                <span className="text-sm text-muted-foreground">O PDF é gerado em tempo real no cliente.</span>
            </div>
            <PDFViewer className="flex-1 w-full border-none shadow-inner">
                <ProposalDocument budget={budget} settings={settings} />
            </PDFViewer>
        </div>
    );
}
