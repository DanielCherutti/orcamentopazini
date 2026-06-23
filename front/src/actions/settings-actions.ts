"use server";

import { Table } from "surrealdb";
import { assertActionSession, assertWriteActionSession } from "@/actions/auth-actions";
import {
  BRAND_DEFAULT_PRIMARY,
  BRAND_DEFAULT_SECONDARY,
  normalizeHex,
} from "@/lib/branding-theme";
import { getHostDisplayBranding } from "@/lib/host-branding";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";
import { auditTenantAction } from "@/lib/audit-log";

export interface ProposalSettings {
    id?: string;
    introduction_text?: string;
    closing_text?: string;
    company_name?: string;
    company_logo_url?: string;
    company_favicon_url?: string;
    /** Linha abaixo do nome quando dados da empresa forem usados em um cabeçalho do PDF. */
    company_header_subtitle?: string;
    /** Contatos disponíveis para o bloco cabeçalho/rodapé do compositor. */
    pdf_contact_whatsapp?: string;
    pdf_contact_facebook?: string;
    pdf_contact_email?: string;
    pdf_contact_website?: string;
    pdf_contact_location?: string;
    primary_color?: string;
    secondary_color?: string;
    /** URL pública do site (links do convite por e-mail), ex.: https://portal.empresa.com */
    app_public_url?: string;
    smtp_host?: string;
    smtp_port?: number;
    smtp_secure?: boolean;
    smtp_user?: string;
    smtp_from?: string;
    /** E-mail que recebe respostas do cliente (cabeçalho Reply-To). */
    smtp_reply_to?: string;
    /** Só leitura (servidor): indica se já existe senha SMTP gravada — nunca envie de volta no salvamento. */
    smtp_pass_configured?: boolean;
    /** IMAP opcional (busca de respostas na aba E-mail do orçamento). Vazio = derivado do SMTP. */
    imap_host?: string;
    imap_user?: string;
    imap_pass_configured?: boolean;
}

/** Payload do formulário ao salvar (senha nova opcional). */
export type UpdateProposalSettingsInput = ProposalSettings & {
    smtp_pass_new?: string;
    imap_pass_new?: string;
};

/** Dados de marca legíveis sem sessão (apenas para tela de login / branding). */
export type PublicProposalBranding = {
  company_name: string;
  company_logo_url?: string;
  company_favicon_url?: string;
  primary_color: string;
  secondary_color: string;
};

const PROPOSAL_SETTINGS_DEFAULTS: ProposalSettings = {
  company_name: "Minha empresa de engenharia",
  company_header_subtitle: "Engenharia",
  introduction_text: `Prezado Cliente,

É com satisfação que apresentamos nossa proposta comercial para execução do seu projeto de engenharia.

Nossa proposta contempla escopo técnico detalhado, materiais conforme normas aplicáveis e prazos acordados.`,
  closing_text: `Termos Gerais:
1. Validade da Proposta: 15 dias.
2. Prazo de execução: conforme cronograma aprovado após aceite.
3. Garantia: conforme especificações técnicas do escopo.`,
  primary_color: BRAND_DEFAULT_PRIMARY,
  secondary_color: BRAND_DEFAULT_SECONDARY,
};

/**
 * Cores e nome exibidos no login. Sem autenticação — host principal = EngHub; subdomínio = org.
 */
export async function getPublicProposalBrandingAction(): Promise<PublicProposalBranding> {
  const branding = await getHostDisplayBranding();
  return {
    company_name: branding.company_name,
    company_logo_url: branding.company_logo_url,
    company_favicon_url: branding.company_favicon_url,
    primary_color: branding.primary_color,
    secondary_color: branding.secondary_color,
  };
}

export async function getProposalSettingsAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const tenantId = await requireActiveTenantId();
        const result = await db.query<[ProposalSettings[]]>(
            "SELECT * FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1",
            { tenantId: tenantRecordId(tenantId) },
        );

        const raw = result[0]?.[0] || { ...PROPOSAL_SETTINGS_DEFAULTS };
        const plain = toPlain(raw) as Record<string, unknown>;

        const smtp_pass_configured =
            typeof plain.smtp_pass === "string" && plain.smtp_pass.length > 0;
        const imap_pass_configured =
            typeof plain.imap_pass === "string" && plain.imap_pass.length > 0;
        delete plain.smtp_pass;
        delete plain.imap_pass;
        delete plain.pdf_header_fill_from_settings;

        const settings: ProposalSettings = {
            ...(plain as unknown as ProposalSettings),
            id: plain.id != null ? String(plain.id) : undefined,
            smtp_pass_configured,
            imap_pass_configured,
        };

        if (settings.smtp_port != null && typeof settings.smtp_port !== "number") {
            settings.smtp_port = Number(settings.smtp_port) || undefined;
        }
        if (settings.smtp_secure != null && typeof settings.smtp_secure !== "boolean") {
            const s = settings.smtp_secure as unknown;
            settings.smtp_secure =
                s === true || s === "true" || s === 1 || s === "1";
        }

        return { success: true, data: settings };
    } catch (e) {
        console.error("Erro settings:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao buscar configurações" };
    }
}

export async function updateProposalSettingsAction(data: UpdateProposalSettingsInput) {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const tenantId = await requireActiveTenantId();
        const {
            smtp_pass_new,
            imap_pass_new,
            smtp_pass_configured: _smtpCfg,
            imap_pass_configured: _imapCfg,
            id: _id,
            ...rest
        } = data;
        const cleanData: Record<string, unknown> = { ...rest };
        delete cleanData.smtp_pass;
        delete cleanData.imap_pass;
        delete cleanData.pdf_header_fill_from_settings;

        if (smtp_pass_new != null && String(smtp_pass_new).trim() !== "") {
            cleanData.smtp_pass = String(smtp_pass_new).trim();
        }
        if (imap_pass_new != null && String(imap_pass_new).trim() !== "") {
            cleanData.imap_pass = String(imap_pass_new).trim();
        }

        if (cleanData.smtp_port === "" || cleanData.smtp_port === undefined) {
            delete cleanData.smtp_port;
        } else {
            cleanData.smtp_port = Number(cleanData.smtp_port) || 587;
        }

        if (typeof cleanData.smtp_secure === "string") {
            cleanData.smtp_secure = cleanData.smtp_secure === "true";
        }

        const result = await db.query<[ProposalSettings[]]>(
            "SELECT * FROM proposal_settings WHERE tenant_id = $tenantId LIMIT 1",
            { tenantId: tenantRecordId(tenantId) },
        );

        if (result[0] && result[0].length > 0) {
            const id = result[0][0].id;
            await db.update(requireRecordId("proposal_settings", String(id!))).merge(cleanData);
        } else {
            await db.create(new Table("proposal_settings")).content({
                ...cleanData,
                tenant_id: tenantRecordId(tenantId),
            });
        }

        revalidatePath("/settings");
        revalidatePath("/dashboard");
        revalidatePath("/");
        await auditTenantAction({
            action: "settings.update",
            resourceType: "proposal_settings",
            tenantId,
            summary: "Configurações da proposta atualizadas",
        });
        return { success: true };
    } catch (e) {
        if (e instanceof InvalidRecordIdError) {
            return { success: false, error: e.message };
        }
        console.error("Erro update settings:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: e instanceof Error ? e.message : "Erro ao salvar configurações" };
    }
}

export async function testImapConnectionAction(): Promise<{
    success: boolean;
    error?: string;
    imapHost?: string;
    imapUser?: string;
}> {
    const auth = await assertWriteActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const { resolveImapConfig } = await import("@/lib/imap-config");
    const { testImapConnection } = await import("@/lib/imap-connect");

    const imap = await resolveImapConfig();
    if (!imap) {
        return {
            success: false,
            error: "IMAP não configurado. Preencha SMTP (e opcionalmente IMAP) em Configurações da empresa.",
        };
    }

    const result = await testImapConnection(imap);
    if (!result.ok) {
        return { success: false, error: result.error, imapHost: imap.host, imapUser: imap.user };
    }
    return { success: true, imapHost: imap.host, imapUser: imap.user };
}
