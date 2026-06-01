#!/usr/bin/env bun
/**
 * Exporta o payload mínimo para diagnosticar geração de PDF de um orçamento.
 *
 * Uso:
 *   bun scripts/export-budget-pdf-debug.ts <budget-id> [saida.json]
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { getDb, toPlain } from "../src/lib/surreal";
import { requireRecordId } from "../src/lib/surreal-record-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const rawBudgetId = process.argv[2]?.trim();
const outputArg = process.argv[3]?.trim();
const startedAt = Date.now();

if (!rawBudgetId) {
    console.error("Uso: bun scripts/export-budget-pdf-debug.ts <budget-id> [saida.json]");
    process.exit(1);
}

function elapsed(): string {
    return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function logStep(message: string): void {
    console.log(`[${elapsed()}] ${message}`);
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}

async function timedQuery<T extends unknown[]>(
    label: string,
    sql: string,
    params: Record<string, unknown>,
): Promise<T[0]> {
    logStep(`Iniciando ${label}...`);
    const t0 = Date.now();
    const [rows] = await db.query<T>(sql, params);
    const count = Array.isArray(rows) ? rows.length : 0;
    const seconds = ((Date.now() - t0) / 1000).toFixed(1);
    logStep(`OK ${label}: ${count} registro(s) em ${seconds}s`);
    return rows;
}

logStep("Conectando ao SurrealDB...");
const db = await getDb();

async function resolveBudgetRecordId(input: string): Promise<ReturnType<typeof requireRecordId>> {
    if (input.startsWith("budget:") || /^[A-Za-z0-9_-]+$/.test(input)) {
        try {
            const direct = requireRecordId("budget", input);
            const [rows] = await db.query<[Array<{ id: unknown }>]>("SELECT id FROM $id LIMIT 1", { id: direct });
            if (rows.length > 0) return direct;
        } catch {
            // Continua tentando por código abaixo.
        }
    }

    const [byCode] = await db.query<[Array<{ id: unknown; code?: string }>]>(
        "SELECT id, code FROM budget WHERE code = $code AND deleted_at IS NONE LIMIT 2",
        { code: input },
    );
    if (byCode.length === 1) return requireRecordId("budget", String(byCode[0].id));
    if (byCode.length > 1) {
        throw new Error(`Mais de um orçamento encontrado com code=${input}. Use o ID budget:...`);
    }

    return requireRecordId("budget", input);
}

logStep(`Resolvendo orçamento ${rawBudgetId}...`);
const budgetId = await resolveBudgetRecordId(rawBudgetId);
logStep(`Orçamento resolvido: ${String(budgetId)}`);

const budget = await timedQuery<[unknown[]]>(
    "budget",
    "SELECT * FROM $budgetId FETCH client_id",
    { budgetId },
);
const settings = await timedQuery<[unknown[]]>(
    "proposal_settings",
    "SELECT * FROM proposal_settings LIMIT 5",
    { budgetId },
);
const blocks = await timedQuery<[unknown[]]>(
    "budget_block",
    "SELECT * FROM budget_block WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
    { budgetId },
);
const blockItems = await timedQuery<[unknown[]]>(
    "budget_item do compositor",
    "SELECT * FROM budget_item WHERE budget_id = $budgetId AND block_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id",
    { budgetId },
);
const locations = await timedQuery<[unknown[]]>(
    "budget_location",
    "SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
    { budgetId },
);
const sections = await timedQuery<[unknown[]]>(
    "budget_section",
    "SELECT * FROM budget_section WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
    { budgetId },
);
const sectionItems = await timedQuery<[unknown[]]>(
    "budget_item do escopo",
    "SELECT * FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id",
    { budgetId },
);
const images = await timedQuery<[unknown[]]>(
    "budget_image",
    "SELECT * FROM budget_image WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC",
    { budgetId },
);
const annotations = await timedQuery<[unknown[]]>(
    "image_annotation",
    "SELECT * FROM image_annotation WHERE image_id.budget_id = $budgetId AND deleted_at IS NONE",
    { budgetId },
);

logStep("Montando JSON...");
const payload = toPlain({
    exported_at: new Date().toISOString(),
    budget_id: String(budgetId),
    counts: {
        budget: budget.length,
        proposal_settings: settings.length,
        budget_block: blocks.length,
        block_items: blockItems.length,
        budget_location: locations.length,
        budget_section: sections.length,
        section_items: sectionItems.length,
        budget_image: images.length,
        image_annotation: annotations.length,
    },
    budget,
    proposal_settings: settings,
    budget_block: blocks,
    block_items: blockItems,
    budget_location: locations,
    budget_section: sections,
    section_items: sectionItems,
    budget_image: images,
    image_annotation: annotations,
});

const json = JSON.stringify(payload, null, 2);
logStep(`JSON montado: ${formatBytes(Buffer.byteLength(json))}`);

if (outputArg) {
    logStep(`Gravando arquivo ${outputArg}...`);
    await fs.writeFile(outputArg, json);
    logStep(`Arquivo gerado: ${outputArg}`);
} else {
    console.log(json);
}
