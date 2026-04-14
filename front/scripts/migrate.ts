#!/usr/bin/env bun
/**
 * Executor de migrações pontuais no SurrealDB (Bun + dotenv).
 *
 * Uso (a partir de `front/`):
 *   bun scripts/migrate.ts scripts/run-migration-backfill-budget-item-budget-id.ts
 *
 * Variáveis: mesmas de `init-db.ts` / `.env` (SURREAL_URL, SURREAL_NS, SURREAL_DB, SURREAL_USER, SURREALDB_PASS).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const arg = process.argv[2];
if (!arg?.trim()) {
    console.error("Indique o ficheiro da migração, ex.: scripts/run-migration-backfill-budget-item-budget-id.ts");
    process.exit(1);
}

const resolved = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
const url = pathToFileURL(resolved).href;

const mod = (await import(url)) as { run?: () => Promise<void> };
if (typeof mod.run !== "function") {
    console.error(`O módulo deve exportar async function run(): ${resolved}`);
    process.exit(1);
}

await mod.run();
console.log("\nMigração concluída.");
