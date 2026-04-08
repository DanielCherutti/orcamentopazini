"use client";

import React from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

function PdfGeneratingOverlay({
    message,
    className,
}: {
    message?: string;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background/90 backdrop-blur-[1px]",
                className
            )}
        >
            <p className="text-sm font-medium text-foreground">
                {message ?? "Gerando visualização do PDF…"}
            </p>
            <div className="relative h-2.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div className="pdf-indeterminate-bar absolute left-0 top-0 h-full w-[42%] rounded-full bg-primary" />
            </div>
            <p className="max-w-xs text-center text-xs text-muted-foreground">
                Orçamentos com muitas imagens podem levar mais tempo.
            </p>
        </div>
    );
}

const PdfBlobPreviewFrameInner = dynamic(
    () =>
        import("@react-pdf/renderer").then((mod) => {
            const { BlobProvider } = mod;
            return function PdfBlobPreviewFrameLoaded({
                document: doc,
                className,
                showToolbar = true,
            }: {
                document: React.ReactElement;
                className?: string;
                showToolbar?: boolean;
            }) {
                return (
                    <BlobProvider
                        document={
                            doc as React.ComponentProps<typeof BlobProvider>["document"]
                        }
                    >
                        {({ url, loading, error }) => (
                            <div
                                className={cn(
                                    "relative flex min-h-0 min-w-0 flex-1 flex-col bg-white",
                                    className
                                )}
                            >
                                {(loading || !url) && !error ? (
                                    <PdfGeneratingOverlay />
                                ) : null}
                                {error ? (
                                    <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-destructive">
                                        Não foi possível gerar o PDF. Tente recarregar a página.
                                    </div>
                                ) : null}
                                {url ? (
                                    <iframe
                                        title="Pré-visualização do PDF"
                                        src={`${url}#toolbar=${showToolbar ? 1 : 0}`}
                                        className="min-h-0 w-full flex-1 border-none shadow-inner"
                                    />
                                ) : null}
                            </div>
                        )}
                    </BlobProvider>
                );
            };
        }),
    {
        ssr: false,
        loading: () => (
            <div className="relative flex min-h-[200px] flex-1 items-center justify-center bg-muted/30">
                <PdfGeneratingOverlay message="Carregando motor de PDF…" className="static bg-transparent backdrop-blur-none" />
            </div>
        ),
    }
);

export function PdfBlobPreviewFrame({
    document: doc,
    className,
    showToolbar = true,
}: {
    document: React.ReactElement;
    className?: string;
    showToolbar?: boolean;
}) {
    return (
        <PdfBlobPreviewFrameInner
            document={doc}
            className={className}
            showToolbar={showToolbar}
        />
    );
}
