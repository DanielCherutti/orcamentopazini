"use server";

import { revalidatePath } from "next/cache";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import { sendBudgetProposalEmail } from "@/lib/budget-proposal-mail";
import { budgetRevalidatePath } from "@/lib/budgets/budget-path";
import {
    appendThreadTokenToSubject,
    stripThreadTokenFromSubject,
} from "@/lib/budgets/budget-email-thread-token";
import {
    getOrCreateThread,
    insertBudgetEmailMessage,
    listMessagesForBudget,
} from "@/lib/budgets/budget-email-store";
import {
    syncAllBudgetEmailReplies,
    syncBudgetEmailReplies,
} from "@/lib/budgets/budget-email-sync";
import {
    hasAnyOutboundBudgetEmail,
    listBudgetCodesByIds,
} from "@/lib/budgets/budget-email-store";
import { generateBudgetPdfBuffer } from "@/lib/pdf/generate-budget-pdf-buffer";
import { PRODUCT_NAME } from "@/lib/product-brand";
import { resolveInviteAppBaseUrl } from "@/lib/proposal-mail-settings";
import { resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";
import { smtpFromAddress } from "@/lib/imap-config";
import { resolveBudgetEmailMailboxInfo } from "@/lib/budget-email-mailbox-info";
import {
    formatRecipientList,
    parseRecipientList,
    validateToAndCc,
} from "@/lib/budgets/budget-email-recipients";
import { canUseBudgetEmail } from "@/lib/budgets/budget-status";
import { getDb } from "@/lib/surreal";
import { assertBudgetInActiveTenant } from "@/lib/budget-tenant";
import { auditTenantAction } from "@/lib/audit-log";

const EMAIL_LOCKED_ERROR =
    "Envio de e-mail disponível apenas após finalizar o orçamento.";

async function assertBudgetEmailAllowed(
    budgetId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
    const tenantGate = await assertBudgetInActiveTenant(budgetId);
    if (!tenantGate.ok) {
        return { ok: false, error: tenantGate.error };
    }
    try {
        const db = await getDb();
        const res = await db.query<[Array<{ status?: string }>]>(
            `SELECT status FROM budget WHERE id = $id LIMIT 1`,
            { id: tenantGate.budgetRecordId }
        );
        const status = res[0]?.[0]?.status;
        if (!canUseBudgetEmail(status != null ? String(status) : null)) {
            return { ok: false, error: EMAIL_LOCKED_ERROR };
        }
        return { ok: true };
    } catch {
        return { ok: false, error: "Não foi possível validar o orçamento." };
    }
}

export type BudgetEmailMessageDto = {
    id: string;
    direction: "out" | "in";
    from_email: string;
    to_email: string;
    cc_email?: string;
    subject: string;
    body_text: string;
    has_pdf_attachment: boolean;
    sent_at: string;
};

export async function getBudgetEmailConversationAction(budgetId: string): Promise<{
    success: boolean;
    messages?: BudgetEmailMessageDto[];
    participant_email?: string;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const allowed = await assertBudgetEmailAllowed(budgetId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    try {
        const messages = await listMessagesForBudget(budgetId);
        const participant =
            messages.find((m) => m.direction === "out")?.to_email ||
            messages.find((m) => m.direction === "in")?.from_email ||
            "";

        return {
            success: true,
            messages: messages.map((m) => ({
                id: m.id,
                direction: m.direction,
                from_email: m.from_email,
                to_email: m.to_email,
                cc_email: m.cc_email,
                subject: stripThreadTokenFromSubject(m.subject),
                body_text: m.body_text,
                has_pdf_attachment: Boolean(m.has_pdf_attachment),
                sent_at: m.sent_at,
            })),
            participant_email: participant || undefined,
        };
    } catch (e) {
        console.error("getBudgetEmailConversationAction:", e);
        return { success: false, error: "Erro ao carregar conversa de e-mail." };
    }
}

export async function getBudgetEmailMailboxInfoAction(): Promise<{
    success: boolean;
    from?: string;
    replyTo?: string;
    imapHost?: string;
    imapUser?: string;
    isNoReplyFrom?: boolean;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const info = await resolveBudgetEmailMailboxInfo();
    if (!info) {
        return {
            success: false,
            error: "SMTP/IMAP não configurado em Configurações da empresa.",
        };
    }
    return { success: true, ...info };
}

export async function syncBudgetEmailRepliesAction(
    budgetId: string
): Promise<{ success: boolean; imported?: number; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const allowed = await assertBudgetEmailAllowed(budgetId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    const result = await syncBudgetEmailReplies(budgetId);
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    revalidatePath(budgetRevalidatePath(budgetId));
    if (result.imported > 0) {
        await auditTenantAction({
            action: "budget_email.sync",
            resourceType: "budget",
            resourceId: budgetId,
            summary: `${result.imported} resposta(s) de e-mail importada(s)`,
            metadata: { imported: result.imported },
        });
    }
    return { success: true, imported: result.imported };
}

export type BudgetEmailSyncImportDto = {
    budgetId: string;
    count: number;
    code?: string;
};

export async function hasActiveBudgetEmailSyncAction(): Promise<{
    success: boolean;
    active?: boolean;
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    try {
        const active = await hasAnyOutboundBudgetEmail();
        return { success: true, active };
    } catch (e) {
        console.error("hasActiveBudgetEmailSyncAction:", e);
        return { success: false, error: "Erro ao verificar conversas de e-mail." };
    }
}

export async function syncAllBudgetEmailRepliesAction(): Promise<{
    success: boolean;
    imported?: number;
    imports?: BudgetEmailSyncImportDto[];
    error?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const active = await hasAnyOutboundBudgetEmail();
    if (!active) {
        return { success: true, imported: 0, imports: [] };
    }

    const result = await syncAllBudgetEmailReplies();
    if (!result.ok) {
        return { success: false, error: result.error };
    }

    const budgetIds = Object.keys(result.importedByBudget).filter(
        (id) => (result.importedByBudget[id] ?? 0) > 0
    );

    const accessibleIds: string[] = [];
    for (const budgetId of budgetIds) {
        const allowed = await assertBudgetEmailAllowed(budgetId);
        if (allowed.ok) accessibleIds.push(budgetId);
    }

    const codes = await listBudgetCodesByIds(accessibleIds);
    const imports: BudgetEmailSyncImportDto[] = accessibleIds.map((budgetId) => ({
        budgetId,
        count: result.importedByBudget[budgetId] ?? 0,
        code: codes.get(budgetId),
    }));

    for (const budgetId of accessibleIds) {
        revalidatePath(budgetRevalidatePath(budgetId));
    }

    const importedAccessible = imports.reduce((sum, row) => sum + row.count, 0);

    if (importedAccessible > 0) {
        await auditTenantAction({
            action: "budget_email.sync_all",
            resourceType: "budget",
            summary: `${importedAccessible} resposta(s) de e-mail importada(s) em lote`,
            metadata: { imported: importedAccessible, budgetCount: imports.length },
        });
    }

    return {
        success: true,
        imported: importedAccessible,
        imports,
    };
}

async function sendAndRecordMessage(
    budgetId: string,
    payload: {
        to: string;
        cc?: string;
        subject: string;
        message?: string;
        includePdf: boolean;
        inReplyTo?: string;
        references?: string[];
    }
): Promise<{ success: boolean; error?: string }> {
    const parsed = validateToAndCc(
        parseRecipientList(payload.to),
        payload.cc ? parseRecipientList(payload.cc) : []
    );
    if (!parsed.ok) return { success: false, error: parsed.error };

    const recipients = parsed.to;
    const ccRecipients = parsed.cc;
    const primaryTo = recipients[0]!;
    const toStored = formatRecipientList(recipients);
    const ccStored = ccRecipients.length > 0 ? formatRecipientList(ccRecipients) : undefined;
    const thread = await getOrCreateThread(budgetId, primaryTo);
    const subjectWithToken = appendThreadTokenToSubject(payload.subject, thread.public_token);

    const pdfOrigin = (await resolveInviteAppBaseUrl()) ?? undefined;
    let pdfFilename: string | undefined;
    let pdfBuffer: Buffer | undefined;

    if (payload.includePdf) {
        const pdfResult = await generateBudgetPdfBuffer(budgetId, { pdfRequestOrigin: pdfOrigin });
        if (!pdfResult.ok) {
            return { success: false, error: pdfResult.error };
        }
        pdfFilename = pdfResult.filename;
        pdfBuffer = pdfResult.buffer;
    }

    const settingsRes = await getProposalSettingsAction();
    const companyName =
        settingsRes.success && settingsRes.data?.company_name
            ? String(settingsRes.data.company_name)
            : PRODUCT_NAME;

    const smtpCfg = await resolveSmtpConfigForInvite();
    const fromEmail = smtpCfg ? smtpFromAddress(smtpCfg).toLowerCase() : "";

    const mail = await sendBudgetProposalEmail({
        to: recipients,
        cc: ccRecipients.length > 0 ? ccRecipients : undefined,
        subject: subjectWithToken,
        message: payload.message,
        companyName,
        pdfFilename,
        pdfBuffer,
        inReplyTo: payload.inReplyTo,
        references: payload.references,
    });

    if (!mail.ok) {
        return { success: false, error: mail.error };
    }

    const bodyStored =
        payload.message?.trim() ||
        (payload.includePdf
            ? "Proposta comercial enviada em anexo (PDF)."
            : "Mensagem enviada.");

    await insertBudgetEmailMessage({
        threadId: thread.id,
        budgetId,
        direction: "out",
        fromEmail,
        toEmail: toStored,
        ccEmail: ccStored,
        subject: subjectWithToken,
        bodyText: bodyStored,
        internetMessageId: mail.internetMessageId,
        inReplyTo: payload.inReplyTo,
        hasPdfAttachment: Boolean(payload.includePdf),
    });

    await auditTenantAction({
        action: payload.includePdf ? "budget_email.send_proposal" : "budget_email.send_reply",
        resourceType: "budget",
        resourceId: budgetId,
        summary: payload.includePdf ? "Proposta enviada por e-mail" : "Resposta enviada por e-mail",
        metadata: { to: toStored, hasPdf: Boolean(payload.includePdf) },
    });

    return { success: true };
}

export async function sendBudgetProposalByEmailAction(
    budgetId: string,
    payload: {
        to: string;
        cc?: string;
        message?: string;
        subject?: string;
        includePdf?: boolean;
    }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const allowed = await assertBudgetEmailAllowed(budgetId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    const pdfOrigin = (await resolveInviteAppBaseUrl()) ?? undefined;
    const pdfResult = await generateBudgetPdfBuffer(budgetId, { pdfRequestOrigin: pdfOrigin });
    if (!pdfResult.ok) {
        return { success: false, error: pdfResult.error };
    }

    const code = pdfResult.budget.code?.trim() || "";
    const title = pdfResult.budget.title?.trim() || "Proposta comercial";
    const defaultSubject = code
        ? `Proposta comercial ${code} — ${title}`
        : `Proposta comercial — ${title}`;
    const subject = payload.subject?.trim() || defaultSubject;

    const res = await sendAndRecordMessage(budgetId, {
        to: payload.to ?? "",
        cc: payload.cc,
        subject,
        message: payload.message,
        includePdf: payload.includePdf !== false,
    });

    if (res.success) {
        revalidatePath(budgetRevalidatePath(budgetId));
    }
    return res;
}

export async function sendBudgetEmailReplyAction(
    budgetId: string,
    payload: {
        to: string;
        cc?: string;
        message: string;
        subject?: string;
        includePdf?: boolean;
    }
): Promise<{ success: boolean; error?: string }> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const allowed = await assertBudgetEmailAllowed(budgetId);
    if (!allowed.ok) return { success: false, error: allowed.error };

    if (!payload.message?.trim()) {
        return { success: false, error: "Escreva uma mensagem para enviar." };
    }

    const existing = await listMessagesForBudget(budgetId);
    const last = existing[existing.length - 1];
    const defaultSubject = last
        ? stripThreadTokenFromSubject(last.subject).replace(/^Re:\s*/i, "")
        : "Proposta comercial";
    const subject = payload.subject?.trim() || `Re: ${defaultSubject}`;

    const refs = existing
        .map((m) => m.internet_message_id)
        .filter(Boolean)
        .slice(-8) as string[];
    const inReplyTo = last?.internet_message_id;

    const res = await sendAndRecordMessage(budgetId, {
        to: payload.to ?? "",
        cc: payload.cc,
        subject,
        message: payload.message,
        includePdf: false,
        inReplyTo,
        references: refs,
    });

    if (res.success) {
        revalidatePath(budgetRevalidatePath(budgetId));
    }
    return res;
}
