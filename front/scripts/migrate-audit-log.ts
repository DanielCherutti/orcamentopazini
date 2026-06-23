#!/usr/bin/env bun
/**
 * Migra platform_audit_log → audit_log
 * Uso: bun scripts/migrate-audit-log.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

async function main(): Promise<void> {
    const { migratePlatformAuditLogToAuditLog } = await import(
        "../src/lib/billing-audit-schema"
    );
    const count = await migratePlatformAuditLogToAuditLog();
    console.log(`Migrados ${count} registro(s) de impersonate.`);
}

main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
