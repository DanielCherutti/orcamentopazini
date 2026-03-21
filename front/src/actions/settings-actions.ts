"use server";

import { Table } from "surrealdb";
import { assertActionSession } from "@/actions/auth-actions";
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

export async function getProposalSettingsAction() {
    const auth = await assertActionSession();
    if (!auth.ok) return { success: false, error: auth.error };

    const db = await getDb();
    try {
        const result = await db.query<[ProposalSettings[]]>("SELECT * FROM proposal_settings LIMIT 1");

        // Dados Padrão (Fallback)
        const defaultSettings: ProposalSettings = {
            company_name: "Pazini - Móveis Planejados",
            introduction_text: `Prezado Cliente,

É com satisfação que apresentamos nossa proposta comercial para execução do seu projeto de móveis planejados.

Nossa proposta contempla materiais de altíssima qualidade, acabamento impecável e garantia estendida.`,
            closing_text: `Termos Gerais:
1. Validade da Proposta: 15 dias.
2. Prazo de Entrega: 45 dias úteis após medição final.
3. Garantia: 5 anos contra defeitos de fabricação.`,
            primary_color: "#1e3a8a", // blue-900
            secondary_color: "#ea580c" // orange-600
        };

        const settings = result[0]?.[0] || defaultSettings;

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
