#!/usr/bin/env bun
/**
 * Remove usuário de uma organização (e apaga a conta se não tiver outros vínculos).
 * Uso: bun scripts/remove-org-user.ts <email-ou-parte> <slug-org>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { StringRecordId } from "surrealdb";
import { getDb } from "../src/lib/surreal";
import { recordIdToString } from "../src/lib/surreal-record-ids";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../.env") });

const emailQuery = process.argv[2]?.trim().toLowerCase();
const orgSlug = process.argv[3]?.trim().toLowerCase() ?? "pazini";
const purgeUser = process.argv.includes("--purge");

if (!emailQuery || emailQuery === "--purge") {
    console.error("Uso: bun scripts/remove-org-user.ts <email-ou-parte> [slug-org] [--purge]");
    process.exit(1);
}

const db = await getDb();

const tenantRows = await db.query<[Array<{ id: unknown; slug?: string; name?: string }>]>(
    "SELECT id, slug, name FROM tenant WHERE slug = $slug LIMIT 1",
    { slug: orgSlug },
);
const tenant = tenantRows[0]?.[0];
const tenantId = recordIdToString(tenant?.id);
if (!tenantId) {
    console.error("Organização não encontrada:", orgSlug);
    process.exit(1);
}
console.log("Org:", tenant?.name, tenantId);

const userRows = await db.query<[Array<{ id: unknown; email?: string; platform_role?: unknown }>]>(
    "SELECT id, email, platform_role FROM portal_user WHERE string::lowercase(email) CONTAINS $q",
    { q: emailQuery },
);
const matches = userRows[0] ?? [];
if (matches.length === 0) {
    console.error("Nenhum usuário encontrado com:", emailQuery);
    process.exit(1);
}
if (matches.length > 1) {
    console.error("Vários usuários encontrados — seja mais específico:");
    for (const m of matches) console.error(" -", m.email, recordIdToString(m.id));
    process.exit(1);
}

const user = matches[0]!;
const userId = recordIdToString(user.id)!;
const email = String(user.email ?? "").trim().toLowerCase();
console.log("Usuário:", email, userId);

const membershipRows = await db.query<[Array<{ id: unknown }>]>(
    "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId",
    { userId: new StringRecordId(userId), tenantId: new StringRecordId(tenantId) },
);
const membershipIds = (membershipRows[0] ?? [])
    .map((row) => recordIdToString(row.id))
    .filter((id): id is string => !!id);
if (membershipIds.length === 0 && !purgeUser) {
    console.error("Usuário não está vinculado a esta organização.");
    process.exit(1);
}

for (const membershipId of membershipIds) {
    await db.delete(new StringRecordId(membershipId));
    console.log("Membership removido:", membershipId);
}
if (membershipIds.length === 0) {
    console.log("Nenhum vínculo com esta org (já removido).");
}

const otherMemberships = await db.query<[Array<{ id: unknown }>]>(
    "SELECT id FROM portal_user_tenant WHERE user_id = $userId LIMIT 1",
    { userId: new StringRecordId(userId) },
);
const hasOtherOrgs = (otherMemberships[0]?.length ?? 0) > 0;
const platformRole = user.platform_role;
const hasPlatformRole =
    platformRole != null &&
    platformRole !== "NONE" &&
    String(platformRole).trim() !== "";

if (purgeUser && !hasPlatformRole) {
    await db.delete(new StringRecordId(userId));
    console.log("Conta portal_user removida (--purge).");
} else if (!hasOtherOrgs && !hasPlatformRole) {
    await db.delete(new StringRecordId(userId));
    console.log("Conta portal_user removida (sem outros vínculos).");
} else if (purgeUser && hasPlatformRole) {
    console.log("Conta mantida: usuário tem papel na plataforma.");
} else {
    console.log("Conta mantida (outras orgs ou papel na plataforma).");
}

console.log(`OK: ${email} removido da org ${orgSlug}. Pode criar de novo.`);
