"use server";

import { revalidatePath } from "next/cache";
import { assertActionSession } from "@/actions/auth-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { sendBudgetProposalEmail } from "@/lib/budget-proposal-mail";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import { generateBudgetPdfBuffer } from "@/lib/pdf/generate-budget-pdf-buffer";
import { resolveInviteAppBaseUrl } from "@/lib/proposal-mail-settings";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendBudgetProposalByEmailAction(
    budgetId: string,
    payload: {
        to: string;
        message?: string;
        subject?: string;
    }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const to = payload.to?.trim().toLowerCase();
    if (!to || !EMAIL_RE.test(to)) {
        return { success: false, error: "Informe um e-mail válido do destinatário." };
    }

    const pdfOrigin = (await resolveInviteAppBaseUrl()) ?? undefined;
    const pdfResult = await generateBudgetPdfBuffer(budgetId, { pdfRequestOrigin: pdfOrigin });
    if (!pdfResult.ok) {
        return { success: false, error: pdfResult.error };
    }

    const settingsRes = await getProposalSettingsAction();
    const companyName =
        settingsRes.success && settingsRes.data?.company_name
            ? String(settingsRes.data.company_name)
            : "Pazini";

    const code = pdfResult.budget.code?.trim() || "";
    const title = pdfResult.budget.title?.trim() || "Proposta comercial";
    const defaultSubject = code
        ? `Proposta comercial ${code} — ${title}`
        : `Proposta comercial — ${title}`;
    const subject = payload.subject?.trim() || defaultSubject;

    const mail = await sendBudgetProposalEmail({
        to,
        subject,
        message: payload.message,
        companyName,
        pdfFilename: pdfResult.filename,
        pdfBuffer: pdfResult.buffer,
    });

    if (!mail.ok) {
        return { success: false, error: mail.error };
    }

    revalidatePath(budgetRevalidatePath(budgetId));
    return { success: true };
}
