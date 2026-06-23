#!/usr/bin/env bun
/**
 * Inicializa namespace, database e tabelas base no SurrealDB.
 * Mantido alinhado com ensureSchema em src/lib/surreal.ts.
 *
 * Roda com Bun (não tsx/Node no Windows): evita assert libuv ao encerrar.
 * Uso: bun run init:db
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Surreal } from "surrealdb";
import { requireSurrealPassword } from "./src/lib/surreal-env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

const host = process.env.SURREALDB_HOST || "127.0.0.1";
const port = process.env.SURREALDB_PORT || "8000";
const endpoint = process.env.SURREAL_URL || `http://${host}:${port}`;
const namespace =
    process.env.SURREAL_NS || process.env.SURREALDB_NS || "dreibox";
const database =
    process.env.SURREAL_DB || process.env.SURREALDB_DB || "pazini";
const username =
    process.env.SURREAL_USER || process.env.SURREALDB_USER || "admin";

/** Mesmo bloco de src/lib/surreal.ts (ensureSchema). */
const BASE_SCHEMA_QL = `
            DEFINE NAMESPACE IF NOT EXISTS \`${namespace}\`;
            USE NAMESPACE \`${namespace}\`;
            DEFINE DATABASE IF NOT EXISTS \`${database}\`;
            USE DATABASE \`${database}\`;
            DEFINE TABLE IF NOT EXISTS company SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product_group SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS product_unit SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS image_library SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS client SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS modelos SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_block SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_item SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_location SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_section SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS budget_image SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS image_annotation SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS proposal_settings SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS portal_user SCHEMALESS;
            DEFINE TABLE IF NOT EXISTS platform_license_settings SCHEMALESS;
            DEFINE INDEX IF NOT EXISTS idx_portal_user_email ON portal_user FIELDS email UNIQUE;
            DEFINE INDEX IF NOT EXISTS idx_modelos_tenant ON modelos FIELDS tenant_id;
            DEFINE INDEX IF NOT EXISTS idx_modelos_tipo ON modelos FIELDS tipo;
            DEFINE INDEX IF NOT EXISTS idx_budget_item_budget_id ON budget_item FIELDS budget_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_item_section_id ON budget_item FIELDS section_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_section_location_id ON budget_section FIELDS location_id;
            DEFINE INDEX IF NOT EXISTS idx_budget_location_budget_id ON budget_location FIELDS budget_id;
            INSERT IGNORE INTO company { id: company:0, name: 'Pazini', created_at: time::now() };
`;

async function main() {
    console.log("Inicializando SurrealDB...");
    console.log(`   Endpoint: ${endpoint}`);
    console.log(`   Namespace: ${namespace}`);
    console.log(`   Database: ${database}\n`);

    const db = new Surreal();
    try {
        const password = requireSurrealPassword();
        console.log(`Connecting to SurrealDB at ${endpoint}...`);
        await db.connect(endpoint, {
            namespace,
            database,
            authentication: { username, password },
        });
        console.log("SurrealDB connected successfully.");
        try {
            await db.query(BASE_SCHEMA_QL);
            console.log("SurrealDB schema ensured.");
        } catch (e) {
            console.warn("SurrealDB ensureSchema warning (non-fatal):", e);
        }
        console.log("\nOK — banco pronto (namespace, database e tabelas base).");
    } finally {
        await db.close();
    }
}

main().catch((err) => {
    console.error("Falha ao inicializar o banco:", err);
    process.exit(1);
});
