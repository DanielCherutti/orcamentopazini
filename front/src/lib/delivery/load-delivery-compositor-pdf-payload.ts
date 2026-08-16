import { headers } from "next/headers";
import { assertActionSession } from "@/actions/auth-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import type { ProposalSettings } from "@/actions/settings-actions";
import { getCustomerAction, type CustomerFull } from "@/actions/client-actions";
import { getDeliveryCompositorTreeSnapshotAction } from "@/actions/delivery-compositor-tree-actions";
import { loadDeliveryProjectExportPayload } from "@/lib/delivery/delivery-project-export-payload";
import { buildTree } from "@/types/budget-compositor-types";
import type { CompositorPdfPayload } from "@/components/pdf/compositor-pdf-types";
import type { Budget } from "@/types/budget-types";
import { renderCompositorPdfVariables } from "@/lib/budget-template-rendering";
import { buildTemplateVariableContext } from "@/lib/model-variables";
import { getDeliveryCompositorShellAction } from "@/actions/delivery-project-actions";

export type DeliveryCompositorPdfPayloadResult =
    | {
          ok: true;
          settings: ProposalSettings;
          compositorPdf?: CompositorPdfPayload;
          budgetShell: Budget;
      }
    | { ok: false; status: number; error: string };

export async function loadDeliveryCompositorPdfPayload(
    rawProjectId: string,
    options?: { pdfRequestOrigin?: string },
): Promise<DeliveryCompositorPdfPayloadResult> {
    const auth = await assertActionSession();
    if (!auth.ok) {
        return { ok: false, status: 401, error: auth.error };
    }

    const isStandaloneDatabook = rawProjectId.startsWith("databook:");
    const loaded = isStandaloneDatabook ? null : await loadDeliveryProjectExportPayload(rawProjectId);
    if (loaded && !loaded.ok) return { ok: false, status: loaded.status, error: loaded.error };

    const [settingsRes, treeRes] = await Promise.all([
        getProposalSettingsAction(),
        getDeliveryCompositorTreeSnapshotAction(rawProjectId),
    ]);

    if (!settingsRes.success || !settingsRes.data) {
        return { ok: false, status: 500, error: settingsRes.error || "Erro ao carregar configurações" };
    }

    const requestHeaders = await headers();
    const settingsRow = settingsRes.data;
    const forwardedHost = requestHeaders.get("x-forwarded-host");
    const host = forwardedHost || requestHeaders.get("host") || "";
    const forwardedProto = requestHeaders.get("x-forwarded-proto");
    const protocol =
        forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    const requestOrigin = host ? `${protocol}://${host}` : undefined;
    const fromRequestUrl = options?.pdfRequestOrigin?.trim().replace(/\/$/, "");
    const fromSettings = settingsRow.app_public_url?.trim().replace(/\/$/, "");
    const appPublicUrl = fromRequestUrl || requestOrigin || fromSettings || "";

    const settings: ProposalSettings = {
        ...settingsRow,
        app_public_url: appPublicUrl || fromSettings || "",
    };

    const shellResult = isStandaloneDatabook
        ? await getDeliveryCompositorShellAction(rawProjectId)
        : null;
    if (isStandaloneDatabook && (!shellResult?.success || !shellResult.data)) {
        return { ok: false, status: 404, error: shellResult?.error ?? "DataBook não encontrado" };
    }
    const project = loaded?.ok ? loaded.payload.project : null;
    const standaloneShell = shellResult?.data;
    const clientId = project?.client_id ?? (standaloneShell?.client_id ? String(standaloneShell.client_id) : undefined);
    let customerForVariables: CustomerFull | null = null;
    if (clientId) {
        const customerRes = await getCustomerAction(clientId);
        if (customerRes.success && customerRes.data) {
            customerForVariables = customerRes.data;
        }
    }

    const budgetShell: Budget = standaloneShell ?? {
        id: project?.budget_id,
        code: project?.budget_code,
        title: project?.title,
        client_id: project?.client_id,
        client_name: project?.client_name,
        use_compositor: true,
    } as Budget;

    let compositorPdf: CompositorPdfPayload | undefined;
    if (treeRes.success && treeRes.blocks?.length) {
        const tree = buildTree(treeRes.blocks, treeRes.items ?? {});
        compositorPdf = {
            roots: tree.blocks,
            items: tree.items,
            imagesByBlock: {},
            scopeFigures: [],
        };
    }

    const variableContext = buildTemplateVariableContext({
        customer: customerForVariables,
        budget: budgetShell,
    });
    compositorPdf = renderCompositorPdfVariables(compositorPdf, variableContext);

    return { ok: true, settings, compositorPdf, budgetShell };
}
