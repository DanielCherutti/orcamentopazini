import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { resolveSmtpConfigForInvite } from "@/lib/proposal-mail-settings";

function formatSmtpFailure(e: unknown): string {
    const base =
        "Não foi possível enviar o e-mail de convite. Verifique os dados em Configurações da empresa (E-mail / convites), credenciais e se o Microsoft 365 tem SMTP autenticado ativo para esta caixa.";
    if (e && typeof e === "object") {
        const o = e as {
            responseCode?: number;
            response?: string;
            message?: string;
        };
        const code = o.responseCode;
        const resp = typeof o.response === "string" ? o.response.trim() : "";
        const msg = typeof o.message === "string" ? o.message.trim() : "";
        const detail = resp || msg;
        if (detail) {
            const short = detail.length > 280 ? `${detail.slice(0, 280)}…` : detail;
            return `${base} Detalhe: ${short}`;
        }
        if (typeof code === "number") {
            return `${base} (código SMTP ${code})`;
        }
    }
    if (e instanceof Error && e.message) {
        return `${base} Detalhe: ${e.message.slice(0, 280)}`;
    }
    return base;
}

export async function sendPortalInviteEmail(options: {
    to: string;
    inviteUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const cfg = await resolveSmtpConfigForInvite();
    if (!cfg) {
        return {
            ok: false,
            error:
                "SMTP não configurado. Preencha em Configurações da empresa (seção E-mail / convites) ou defina SMTP_* no .env como fallback.",
        };
    }

    try {
        // Microsoft 365: porta 587 usa STARTTLS (secure=false + requireTLS).
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
            ...(process.env.SMTP_DEBUG === "1" || process.env.SMTP_DEBUG === "true"
                ? { debug: true, logger: true }
                : {}),
        };

        const transporter = nodemailer.createTransport(transportOptions);

        const subject = "Convite para acessar o portal";
        const text = [
            "Você foi convidado a acessar o portal Pazini.",
            "",
            "Para criar sua senha e ativar o acesso, abra o link abaixo (válido por tempo limitado):",
            options.inviteUrl,
            "",
            "Se você não esperava este e-mail, ignore esta mensagem.",
        ].join("\n");

        const html = `
<p>Você foi convidado a acessar o portal Pazini.</p>
<p><a href="${options.inviteUrl.replace(/"/g, "&quot;")}">Criar minha senha e entrar</a></p>
<p style="font-size:12px;color:#666">Se o link não abrir, copie e cole no navegador:<br/>${options.inviteUrl.replace(/</g, "&lt;")}</p>
<p style="font-size:12px;color:#666">Se você não esperava este e-mail, ignore esta mensagem.</p>
`.trim();

        await transporter.sendMail({
            from: cfg.from,
            to: options.to,
            subject,
            text,
            html,
        });

        return { ok: true };
    } catch (e) {
        console.error("[portal-invite-mail] Falha ao enviar:", e);
        return { ok: false, error: formatSmtpFailure(e) };
    }
}
