import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBudgetPdfScopeAction } from "@/actions/budget-actions";
import { getCompositorTreeSnapshotAction } from "@/actions/budget-compositor-tree-actions";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";
import { buildTree } from "@/types/budget-compositor-types";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import type { ProposalSettings } from "@/actions/settings-actions";

export const metadata: Metadata = {
  title: "Exportar PDF",
};
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { PdfClientViewer } from "@/components/pdf/pdf-client-viewer";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BudgetPdfPage({ params }: PageProps) {
  const { id } = await params;
  const requestHeaders = await headers();

  const [budgetRes, settingsRes] = await Promise.all([
    getBudgetPdfScopeAction(id),
    getProposalSettingsAction(),
  ]);

  if (!budgetRes.success || !budgetRes.data) {
    return notFound();
  }

  const settings = (settingsRes.data || {}) as ProposalSettings;
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost || requestHeaders.get("host") || "";
  const forwardedProto = requestHeaders.get("x-forwarded-proto");
  const protocol =
    forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  const requestOrigin = host ? `${protocol}://${host}` : undefined;
  const appPublicUrl = settings.app_public_url?.trim() || requestOrigin;
  const settingsWithPublicUrl: ProposalSettings = {
    ...settings,
    app_public_url: appPublicUrl,
  };
  const budget = budgetRes.data;

  let compositorPdf: CompositorPdfPayload | undefined;
  if (budget.use_compositor && budget.id) {
    const budgetId = String(budget.id);
    const [snap, figRes] = await Promise.all([
      getCompositorTreeSnapshotAction(budgetId),
      getScopeFiguresListAction(budgetId),
    ]);
    if (snap.success && snap.blocks?.length) {
      const tree = buildTree(snap.blocks, snap.items ?? {});
      compositorPdf = {
        roots: tree.blocks,
        items: tree.items,
        scopeFigures:
          figRes.success && figRes.entries?.length
            ? figRes.entries.map((e) => ({ id: e.id, caption: e.caption }))
            : [],
      };
    }
  }

  return (
    <PdfClientViewer
      budget={budget}
      settings={settingsWithPublicUrl}
      compositorPdf={compositorPdf}
    />
  );
}
