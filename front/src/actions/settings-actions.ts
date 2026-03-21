"use server";

import { Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
import {
  BRAND_DEFAULT_PRIMARY,
  BRAND_DEFAULT_SECONDARY,
  normalizeHex,
} from "@/lib/branding-theme";
import { getDb, resetDb, isTokenExpiredError, toPlain } from "@/lib/surreal";
import { revalidatePath } from "next/cache";
import { InvalidRecordIdError, requireRecordId } from "@/lib/surreal-record-ids";

export interface ProposalSettings {
    id?: string;
    introduction_text?: string;
    closing_text?: string;
    company_name?: string;
    company_logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
}

/** Dados de marca legíveis sem sessão (apenas para tela de login / branding). */
export type PublicProposalBranding = {
  company_name: string;
  company_logo_url?: string;
  primary_color: string;
  secondary_color: string;
};

const PROPOSAL_SETTINGS_DEFAULTS: ProposalSettings = {
  company_name: "Pazini - Móveis Planejados",
  introduction_text: `Prezado Cliente,

É com satisfação que apresentamos nossa proposta comercial para execução do seu projeto de móveis planejados.

Nossa proposta contempla materiais de altíssima qualidade, acabamento impecável e garantia estendida.`,
  closing_text: `Termos Gerais:
1. Validade da Proposta: 15 dias.
2. Prazo de Entrega: 45 dias úteis após medição final.
3. Garantia: 5 anos contra defeitos de fabricação.`,
  primary_color: BRAND_DEFAULT_PRIMARY,
  secondary_color: BRAND_DEFAULT_SECONDARY,
};

/**
 * Cores e nome exibidos no login. Sem autenticação — apenas campos não sensíveis.
 */
export async function getPublicProposalBrandingAction(): Promise<PublicProposalBranding> {
  try {
    const db = await getDb();
    const result = await db.query<
      [
        {
          primary_color?: string;
          secondary_color?: string;
          company_name?: string;
          company_logo_url?: string;
        }[],
      ]
    >(
      "SELECT primary_color, secondary_color, company_name, company_logo_url FROM proposal_settings LIMIT 1"
    );
    const row = result[0]?.[0];
    const primary =
      normalizeHex(row?.primary_color != null ? String(row.primary_color) : undefined) ??
      BRAND_DEFAULT_PRIMARY;
    const secondary =
      normalizeHex(row?.secondary_color != null ? String(row.secondary_color) : undefined) ??
      BRAND_DEFAULT_SECONDARY;
    return {
      company_name:
        row?.company_name != null && String(row.company_name).trim() !== ""
          ? String(row.company_name).trim()
          : PROPOSAL_SETTINGS_DEFAULTS.company_name!,
      company_logo_url:
        row?.company_logo_url != null && String(row.company_logo_url).trim() !== ""
          ? String(row.company_logo_url).trim()
          : undefined,
      primary_color: primary,
      secondary_color: secondary,
    };
  } catch (e) {
    console.error("getPublicProposalBrandingAction:", e);
    if (isTokenExpiredError(e)) resetDb();
    return {
      company_name: PROPOSAL_SETTINGS_DEFAULTS.company_name!,
      primary_color: BRAND_DEFAULT_PRIMARY,
      secondary_color: BRAND_DEFAULT_SECONDARY,
    };
  }
}

export async function getProposalSettingsAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const result = await db.query<[ProposalSettings[]]>("SELECT * FROM proposal_settings LIMIT 1");

        const settings = result[0]?.[0] || { ...PROPOSAL_SETTINGS_DEFAULTS };

        // Serializar ID se existir
        if (settings.id) settings.id = String(settings.id);

        return { success: true, data: toPlain(settings) };
    } catch (e) {
        console.error("Erro settings:", e);
        if (isTokenExpiredError(e)) resetDb();
        return { success: false, error: "Erro ao buscar configurações" };
    }
}

export async function updateProposalSettingsAction(data: ProposalSettings) {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const cleanData = { ...data };
        delete cleanData.id;

        const result = await db.query<[ProposalSettings[]]>("SELECT * FROM proposal_settings LIMIT 1");

        if (result[0] && result[0].length > 0) {
            const id = result[0][0].id; // SurrealDB ID
            await db.update(requireRecordId("proposal_settings", String(id!))).merge(cleanData);
        } else {
            await db.create(new Table("proposal_settings")).content(cleanData);
        }

        revalidatePath("/settings");
        revalidatePath("/dashboard");
        revalidatePath("/");
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
