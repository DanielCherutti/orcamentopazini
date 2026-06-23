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

async function main(): Promise<void> {
    const arg = process.argv[2];
    if (!arg?.trim()) {
        throw new Error(
            "Indique o ficheiro da migração, ex.: scripts/run-migration-backfill-budget-item-budget-id.ts",
        );
    }

    const resolved = path.isAbsolute(arg) ? arg : path.resolve(process.cwd(), arg);
    const url = pathToFileURL(resolved).href;
    const mod = (await import(url)) as { run?: () => Promise<void> };

    if (typeof mod.run !== "function") {
        throw new Error(`O módulo deve exportar async function run(): ${resolved}`);
    }

    await mod.run();
    console.log("\nMigração concluída.");
    // Encerra o processo: conexão SurrealDB mantém o event loop ativo.
    process.exit(0);
}

main().catch((error: unknown) => {
    console.error("Falha na migração:", error);
    process.exit(1);
});
