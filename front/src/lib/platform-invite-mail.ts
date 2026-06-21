import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { getPlatformSmtpConfig } from "@/lib/platform-smtp";
import { PLATFORM_ROLE_LABELS, type PlatformRole } from "@/types/platform-types";

function formatSmtpFailure(e: unknown): string {
    const base =
        "Não foi possível enviar o convite. Configure PLATFORM_SMTP_* ou SMTP_* no .env.";
    if (e instanceof Error && e.message) {
        return `${base} Detalhe: ${e.message.slice(0, 280)}`;
    }
    return base;
}

export async function sendPlatformTeamInviteEmail(options: {
    to: string;
    inviteUrl: string;
    role: PlatformRole;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const cfg = getPlatformSmtpConfig();
    if (!cfg) {
        return {
            ok: false,
            error:
                "SMTP não configurado. Defina PLATFORM_SMTP_* ou SMTP_* no .env do servidor.",
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
        const roleLabel = PLATFORM_ROLE_LABELS[options.role];
        const subject = "Convite — equipe da plataforma Pazini";
        const text = [
            `Você foi convidado para a equipe da plataforma Pazini (${roleLabel}).`,
            "",
            "Crie sua senha pelo link abaixo (válido por tempo limitado):",
            options.inviteUrl,
            "",
            "Após ativar, faça login para acessar o painel /platform.",
            "",
            "Se você não esperava este e-mail, ignore esta mensagem.",
        ].join("\n");

        const html = `
<p>Você foi convidado para a equipe da plataforma Pazini (<strong>${roleLabel}</strong>).</p>
<p><a href="${options.inviteUrl.replace(/"/g, "&quot;")}">Criar senha e ativar acesso</a></p>
<p style="font-size:12px;color:#666">Depois do cadastro, entre em /platform com e-mail e senha.</p>
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
        console.error("[platform-invite-mail] Falha ao enviar:", e);
        return { ok: false, error: formatSmtpFailure(e) };
    }
}
