"use client";

import dynamic from "next/dynamic";

const PdfClientViewerLazy = dynamic(
  () =>
    import("./pdf-client-viewer").then((m) => ({
      default: m.PdfClientViewer,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[40vh] items-center justify-center p-8 text-muted-foreground">
        A carregar visualização…
      </div>
    ),
  }
);

/** Entrada cliente: `ssr: false` só é permitido dentro de um Client Component (não na `page` RSC). */
export function PdfClientViewerEntry(props: { budgetId: string }) {
  return <PdfClientViewerLazy {...props} />;
}
