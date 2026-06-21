#!/usr/bin/env bun
/**
 * Promove um usuário a admin da plataforma SaaS (sem membership em orgs clientes).
 * Uso: bun scripts/promote-master.ts henrico@pazini.com
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { StringRecordId } from "surrealdb";
import { getDb } from "../src/lib/surreal";
import { recordIdToString } from "../src/lib/surreal-record-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
    console.error("Uso: bun scripts/promote-master.ts <email>");
    process.exit(1);
}

const db = await getDb();
const users = await db.query<[Array<{ id: unknown }>]>(
    "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
    { email },
);
const userId = recordIdToString(users[0]?.[0]?.id);
if (!userId) {
    console.error("Usuário não encontrado:", email);
    process.exit(1);
}

await db.query(
    "UPDATE $id SET is_platform_master = true, updated_at = $u",
    {
        id: new StringRecordId(userId),
        u: new Date().toISOString(),
    },
);

await db.query(
    "DELETE portal_user_tenant WHERE user_id = $userId",
    { userId: new StringRecordId(userId) },
);

console.log(`OK: ${email} → admin da plataforma (is_platform_master=true, memberships removidas)`);
console.log("Faça logout/login para entrar em /platform");
process.exit(0);
