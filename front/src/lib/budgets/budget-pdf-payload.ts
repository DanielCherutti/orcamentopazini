import { headers } from "next/headers";
import { assertActionSession } from "@/actions/auth-actions";
import { getBudgetPdfScopeAction } from "@/actions/budget-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { getCustomerAction, type CustomerFull } from "@/actions/client-actions";
import type { ProposalSettings } from "@/actions/settings-actions";
import { getCompositorTreeSnapshotAction } from "@/actions/budget-compositor-tree-actions";
import {
    ensureCompositorHeaderFooterBlockAction,
    ensureCompositorQuoteBlockAction,
} from "@/actions/budget-compositor-block-actions";
import { getScopeFiguresListAction } from "@/actions/budget-scope-actions";
import { buildTree } from "@/types/budget-compositor-types";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import type { Budget } from "@/types/budget-types";
import { renderCompositorPdfVariables } from "@/lib/budget-template-rendering";
import { buildTemplateVariableContext } from "@/lib/model-variables";

export type BudgetPdfPayloadResult =
    | { ok: true; budget: Budget; settings: ProposalSettings; compositorPdf?: CompositorPdfPayload }
    | { ok: false; status: number; error: string };

export type LoadBudgetPdfPayloadOptions = {
    /**
     * Origin do pedido HTTP atual (ex. `new URL(request.url).origin` na rota do PDF).
     * Garante URLs absolutas no Node para o React-PDF; deve prevalecer sobre `app_public_url` da BD em dev.
     */
    pdfRequestOrigin?: string;
};

/**
 * Dados para `ProposalDocument` (página /pdf e rota `/api/budgets/.../pdf`).
 * Exige sessão; replica a lógica da página de exportação.
 */
export async function loadBudgetPdfPayload(
    rawBudgetId: string,
    options?: LoadBudgetPdfPayloadOptions
): Promise<BudgetPdfPayloadResult> {
    const auth = await assertActionSession();
    if (!auth.ok) {
        return { ok: false, status: 401, error: auth.error };
    }

    const [budgetRes, settingsRes] = await Promise.all([
        getBudgetPdfScopeAction(rawBudgetId),
        getProposalSettingsAction(),
    ]);

    if (!budgetRes.success || !budgetRes.data) {
        return {
            ok: false,
            status: 404,
            error: budgetRes.error || "Orçamento não encontrado",
        };
    }

    if (!settingsRes.success || !settingsRes.data) {
        return {
            ok: false,
            status: 500,
            error: settingsRes.error || "Erro ao carregar configurações",
        };
    }

    const requestHeaders = await headers();
    const budget = budgetRes.data;
    const settingsRow = settingsRes.data;
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const host = forwardedHost || requestHeaders.get("host") || "";
    const forwardedProto = requestHeaders.get("x-forwarded-proto");
    const protocol =
        forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    const requestOrigin = host ? `${protocol}://${host}` : undefined;
    const fromRequestUrl = options?.pdfRequestOrigin?.trim().replace(/\/$/, "");
    const fromSettings = settingsRow.app_public_url?.trim().replace(/\/$/, "");
    const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    const fromVercel = process.env.VERCEL_URL?.trim()
        ? `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
        : undefined;
    /** Ordem: pedido atual → headers → BD → env (imagens no servidor precisam bater com este host). */
    const appPublicUrl =
        fromRequestUrl || requestOrigin || fromSettings || fromEnv || fromVercel || undefined;
    const settings: ProposalSettings = {
        ...settingsRow,
        app_public_url: appPublicUrl ?? fromSettings ?? "",
    };

    let compositorPdf: CompositorPdfPayload | undefined;
    let customerForVariables: CustomerFull | null = null;
    if (budget.client_id) {
        const customerRes = await getCustomerAction(String(budget.client_id));
        if (customerRes.success && customerRes.data) {
            customerForVariables = customerRes.data;
        }
    }

    if (budget.use_compositor && budget.id) {
        const budgetId = String(budget.id);
        await ensureCompositorHeaderFooterBlockAction(budgetId, { skipRevalidate: true });
        // Garante bloco ORÇAMENTO também na leitura de PDF (orçamentos antigos sem quote raiz).
        await ensureCompositorQuoteBlockAction(budgetId, { skipRevalidate: true });
        const [snap, figRes] = await Promise.all([
            getCompositorTreeSnapshotAction(budgetId),
            getScopeFiguresListAction(budgetId),
        ]);
        if (snap.success && snap.blocks?.length) {
            const tree = buildTree(snap.blocks, snap.items ?? {});
            compositorPdf = {
                roots: tree.blocks,
                items: tree.items,
                imagesByBlock: (snap.imagesByBlock ?? {}) as CompositorPdfPayload["imagesByBlock"],
                scopeFigures:
                    figRes.success && figRes.entries?.length
                        ? figRes.entries.map((e) => ({ id: e.id, caption: e.caption }))
                        : [],
            };
        }
    }

    const variableContext = buildTemplateVariableContext({
        customer: customerForVariables,
        budget,
    });
    compositorPdf = renderCompositorPdfVariables(compositorPdf, variableContext);

    return { ok: true, budget, settings, compositorPdf };
}
