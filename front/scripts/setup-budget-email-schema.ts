/**
 * Tabelas para conversa de e-mail por orçamento (envio + respostas sincronizadas via IMAP).
 * Executar: bun scripts/setup-budget-email-schema.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const STATEMENTS = [
    `DEFINE TABLE IF NOT EXISTS budget_email_thread TYPE ANY SCHEMALESS PERMISSIONS NONE;`,
    `DEFINE TABLE IF NOT EXISTS budget_email_message TYPE ANY SCHEMALESS PERMISSIONS NONE;`,
    `DEFINE INDEX IF NOT EXISTS idx_budget_email_thread_budget ON budget_email_thread FIELDS budget_id;`,
    `DEFINE INDEX IF NOT EXISTS idx_budget_email_thread_token ON budget_email_thread FIELDS public_token;`,
    `DEFINE INDEX IF NOT EXISTS idx_budget_email_message_thread ON budget_email_message FIELDS thread_id;`,
    `DEFINE INDEX IF NOT EXISTS idx_budget_email_message_imid ON budget_email_message FIELDS internet_message_id;`,
];

async function main() {
    const { getDb } = await import("../src/lib/surreal");
    const db = await getDb();
    for (const sql of STATEMENTS) {
        await db.query(sql);
        console.log("OK:", sql.slice(0, 60));
    }
    console.log("Schema de e-mail do orçamento aplicado.");
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
