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

if (!rawBudgetId) {
    console.error("Uso: bun scripts/export-budget-pdf-debug.ts <budget-id> [saida.json]");
    process.exit(1);
}

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

const budgetId = await resolveBudgetRecordId(rawBudgetId);

const [
    budget,
    settings,
    blocks,
    blockItems,
    locations,
    sections,
    sectionItems,
    images,
    annotations,
] = await db.query<
    [
        unknown[],
        unknown[],
        unknown[],
        unknown[],
        unknown[],
        unknown[],
        unknown[],
        unknown[],
        unknown[],
    ]
>(
    `
    SELECT * FROM $budgetId FETCH client_id;
    SELECT * FROM proposal_settings LIMIT 5;
    SELECT * FROM budget_block WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC;
    SELECT * FROM budget_item WHERE budget_id = $budgetId AND block_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id;
    SELECT * FROM budget_location WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC;
    SELECT * FROM budget_section WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC;
    SELECT * FROM budget_item WHERE budget_id = $budgetId AND section_id IS NOT NONE AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC FETCH product_id;
    SELECT * FROM budget_image WHERE budget_id = $budgetId AND deleted_at IS NONE ORDER BY order_index ASC, created_at ASC;
    SELECT * FROM image_annotation WHERE image_id.budget_id = $budgetId AND deleted_at IS NONE;
    `,
    { budgetId },
);

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

if (outputArg) {
    await fs.writeFile(outputArg, json);
    console.log(`Arquivo gerado: ${outputArg}`);
} else {
    console.log(json);
}
