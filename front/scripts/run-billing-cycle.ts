#!/usr/bin/env bun
/**
 * Executa ciclo de cobrança recorrente (idempotente por org/mês).
 * Uso: bun scripts/run-billing-cycle.ts
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { runBillingCycleAction } from "../src/actions/platform-billing-actions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const result = await runBillingCycleAction();
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
