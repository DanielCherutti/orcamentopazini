import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";

function formatSmtpFailure(e: unknown): string {
    const base =
        "Não foi possível enviar o e-mail. Verifique SMTP em Configurações da empresa (E-mail / convites) e as credenciais da caixa remetente.";
    if (e && typeof e === "object") {
        const o = e as { responseCode?: number; response?: string; message?: string };
        const detail =
            (typeof o.response === "string" ? o.response.trim() : "") ||
            (typeof o.message === "string" ? o.message.trim() : "");
        if (detail) {
            const short = detail.length > 280 ? `${detail.slice(0, 280)}…` : detail;
            return `${base} Detalhe: ${short}`;
        }
        if (typeof o.responseCode === "number") {
            return `${base} (código SMTP ${o.responseCode})`;
        }
    }
    if (e instanceof Error && e.message) {
        return `${base} Detalhe: ${e.message.slice(0, 280)}`;
    }
    return base;
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type SendBudgetEmailResult =
    | { ok: true; internetMessageId: string }
    | { ok: false; error: string };

export async function sendBudgetProposalEmail(options: {
    to: string;
    subject: string;
    message?: string;
    companyName?: string;
    pdfFilename?: string;
    pdfBuffer?: Buffer;
    internetMessageId?: string;
    inReplyTo?: string;
    references?: string[];
}): Promise<SendBudgetEmailResult> {
    const cfg = await resolveSmtpConfigForInvite();
    if (!cfg) {
        return {
            ok: false,
            error:
                "SMTP não configurado. Preencha em Configurações da empresa (seção E-mail / convites) ou defina SMTP_* no .env.",
        };
    }

    try {
        const useStartTls = !cfg.secure && (cfg.port === 587 || cfg.port === 25);
        const transportOptions: SMTPTransport.Options = {
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: { user: cfg.user, pass: cfg.pass },
            requireTLS: useStartTls,
            tls: {
                rejectUnauthorized: true,
                minVersion: "TLSv1.2",
                servername: cfg.host,
            },
            connectionTimeout: 25_000,
            greetingTimeout: 25_000,
        };

        const transporter = nodemailer.createTransport(transportOptions);
        const company = options.companyName?.trim() || "Pazini";
        const personal = options.message?.trim() || "";
        const intro =
            personal ||
            (options.pdfBuffer
                ? "Segue em anexo a proposta comercial solicitada. Permanecemos à disposição para esclarecimentos."
                : "Segue retorno referente à nossa proposta comercial.");

        const text = [intro, "", `Atenciosamente,`, company].join("\n");

        const htmlPersonal = personal
            ? `<p style="margin:0 0 12px;white-space:pre-wrap">${escapeHtml(personal)}</p>`
            : options.pdfBuffer
              ? `<p style="margin:0 0 12px">Segue em anexo a proposta comercial solicitada. Permanecemos à disposição para esclarecimentos.</p>`
              : `<p style="margin:0 0 12px">Segue retorno referente à nossa proposta comercial.</p>`;

        const html = `
<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">
  ${htmlPersonal}
  <p style="margin:24px 0 0;color:#555">Atenciosamente,<br/><strong>${escapeHtml(company)}</strong></p>
</div>`.trim();

        const messageId =
            options.internetMessageId?.trim() ||
            `<pazini.${Date.now()}.${Math.random().toString(36).slice(2)}@${cfg.host.replace(/[^a-z0-9.-]/gi, "") || "pazini.local"}>`;

        const headers: Record<string, string> = {};
        if (options.inReplyTo) {
            headers["In-Reply-To"] = options.inReplyTo.startsWith("<")
                ? options.inReplyTo
                : `<${options.inReplyTo}>`;
        }
        if (options.references?.length) {
            headers.References = options.references
                .map((r) => (r.startsWith("<") ? r : `<${r}>`))
                .join(" ");
        }

        const attachments =
            options.pdfBuffer && options.pdfFilename
                ? [
                      {
                          filename: options.pdfFilename,
                          content: options.pdfBuffer,
                          contentType: "application/pdf",
                      },
                  ]
                : [];

        const replyTo = cfg.replyTo?.trim() || cfg.from;

        const info = await transporter.sendMail({
            from: cfg.from,
            replyTo,
            to: options.to,
            subject: options.subject,
            text,
            html,
            messageId,
            headers: Object.keys(headers).length ? headers : undefined,
            attachments,
        });

        const sentId = info.messageId || messageId;
        return { ok: true, internetMessageId: sentId };
    } catch (e) {
        console.error("[budget-proposal-mail] Falha ao enviar:", e);
        return { ok: false, error: formatSmtpFailure(e) };
    }
}
