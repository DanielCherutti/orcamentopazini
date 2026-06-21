#!/usr/bin/env bun
/**
 * Migra platform_audit_log → audit_log
 * Uso: bun scripts/migrate-audit-log.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { migratePlatformAuditLogToAuditLog } from "../src/lib/billing-audit-schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const count = await migratePlatformAuditLogToAuditLog();
console.log(`Migrados ${count} registro(s) de impersonate.`);
process.exit(0);
