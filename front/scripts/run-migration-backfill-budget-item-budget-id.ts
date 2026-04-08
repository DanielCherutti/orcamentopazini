/**
 * Preenche `budget_id` em `budget_item` onde falta (dados anteriores à denormalização).
 *
 * Ordem de resolução:
 * 1. `section_id` → `budget_section.budget_id` (ou, se vazio, `location_id` → `budget_location.budget_id`)
 * 2. Só `block_id` (compositor) → `budget_block.budget_id`
 *
 * Execução (em `front/`):
 *   bun scripts/migrate.ts scripts/run-migration-backfill-budget-item-budget-id.ts
 *
 * Simular sem gravar:
 *   MIGRATE_DRY_RUN=1 bun scripts/migrate.ts scripts/run-migration-backfill-budget-item-budget-id.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Surreal } from "surrealdb";
import { requireSurrealPassword } from "../src/lib/surreal-env";
import {
    canonicalTableRecordId,
    recordIdToString,
    requireRecordId,
    safeStringRecordId,
} from "../src/lib/surreal-record-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const host = process.env.SURREALDB_HOST || "127.0.0.1";
const port = process.env.SURREALDB_PORT || "8000";
const endpoint = process.env.SURREAL_URL || `http://${host}:${port}`;
const namespace = process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database = process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username = process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";

const DRY = String(process.env.MIGRATE_DRY_RUN || "").trim() === "1";

function hasBudgetIdField(raw: unknown): boolean {
    if (raw == null) return false;
    const s = recordIdToString(raw).trim();
    return s.length > 0 && s !== "NONE";
}

async function resolveBudgetIdFromSection(
    db: Surreal,
    sectionIdStr: string
): Promise<string | null> {
    const secRid = safeStringRecordId("budget_section", sectionIdStr);
    if (!secRid) return null;
    const secRow = await db.select(secRid);
    const sec = (Array.isArray(secRow) ? secRow[0] : secRow) as Record<string, unknown> | undefined;
    if (!sec) return null;

    if (hasBudgetIdField(sec.budget_id)) {
        return canonicalTableRecordId("budget", sec.budget_id);
    }

    const locRaw = sec.location_id;
    if (!locRaw) return null;
    const locId = canonicalTableRecordId("budget_location", locRaw);
    if (!locId) return null;
    const locRid = safeStringRecordId("budget_location", locId.replace(/^budget_location:/, ""));
    if (!locRid) return null;
    const locRow = await db.select(locRid);
    const loc = (Array.isArray(locRow) ? locRow[0] : locRow) as Record<string, unknown> | undefined;
    if (!loc || !hasBudgetIdField(loc.budget_id)) return null;
    return canonicalTableRecordId("budget", loc.budget_id);
}

async function resolveBudgetIdFromBlock(db: Surreal, blockIdStr: string): Promise<string | null> {
    const blockRid = safeStringRecordId("budget_block", blockIdStr);
    if (!blockRid) return null;
    const blockRow = await db.select(blockRid);
    const block = (Array.isArray(blockRow) ? blockRow[0] : blockRow) as Record<string, unknown> | undefined;
    if (!block || !hasBudgetIdField(block.budget_id)) return null;
    return canonicalTableRecordId("budget", block.budget_id);
}

export async function run(): Promise<void> {
    const db = new Surreal();
    try {
        const password = requireSurrealPassword();
        console.log(`A ligar a ${endpoint} (${namespace}/${database})…`);
        await db.connect(endpoint, {
            namespace,
            database,
            authentication: { username, password },
        });

        const res = await db.query<[Array<Record<string, unknown>>]>(
            `SELECT id, section_id, block_id, budget_id FROM budget_item WHERE deleted_at IS NONE`
        );
        const rows = res[0] ?? [];

        let alreadyOk = 0;
        let updated = 0;
        let wouldUpdate = 0;
        let noSource = 0;
        let errors = 0;

        for (const row of rows) {
            const itemIdStr = recordIdToString(row.id);
            if (!itemIdStr) continue;

            if (hasBudgetIdField(row.budget_id)) {
                alreadyOk++;
                continue;
            }

            let budgetCanon: string | null = null;

            const secRaw = row.section_id;
            if (secRaw != null && recordIdToString(secRaw).trim() !== "") {
                const sid = canonicalTableRecordId("budget_section", secRaw);
                budgetCanon = await resolveBudgetIdFromSection(
                    db,
                    sid.replace(/^budget_section:/, "")
                );
            }

            if (!budgetCanon) {
                const blkRaw = row.block_id;
                if (blkRaw != null && recordIdToString(blkRaw).trim() !== "") {
                    const bid = canonicalTableRecordId("budget_block", blkRaw);
                    budgetCanon = await resolveBudgetIdFromBlock(db, bid.replace(/^budget_block:/, ""));
                }
            }

            if (!budgetCanon) {
                noSource++;
                continue;
            }

            if (DRY) {
                wouldUpdate++;
                continue;
            }

            try {
                const itemRid = requireRecordId("budget_item", itemIdStr);
                const budgetRid = requireRecordId("budget", budgetCanon);
                await db.update(itemRid).merge({ budget_id: budgetRid });
                updated++;
            } catch (e) {
                errors++;
                console.warn(`Falha item ${itemIdStr}:`, e);
            }
        }

        console.log(
            DRY
                ? "--- Modo MIGRATE_DRY_RUN=1 (nada gravado) ---"
                : "--- Execução com gravação ---"
        );
        console.log(`Linhas budget_item (não apagadas): ${rows.length}`);
        console.log(`Já com budget_id: ${alreadyOk}`);
        if (DRY) {
            console.log(`Seriam atualizados: ${wouldUpdate}`);
        } else {
            console.log(`Atualizados: ${updated}`);
        }
        console.log(`Sem section/block ou sem budget resolvível: ${noSource}`);
        console.log(`Erros: ${errors}`);
    } finally {
        await db.close();
    }
}
