#!/usr/bin/env bun
/**
 * Cria o primeiro usuário do portal a partir do .env (uma vez).
 * Usa PAZINI_LOGIN_EMAIL e PAZINI_LOGIN_PASSWORD.
 *
 * Uso: bun run seed:portal-user
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Table } from "surrealdb";
import { getDb } from "./src/lib/surreal";
import { hashPassword } from "./src/lib/password";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, ".env") });

async function main() {
    const email = process.env.PAZINI_LOGIN_EMAIL?.trim().toLowerCase();
    const plain = process.env.PAZINI_LOGIN_PASSWORD;

    if (!email || !plain) {
        console.error(
            "Defina PAZINI_LOGIN_EMAIL e PAZINI_LOGIN_PASSWORD no front/.env",
        );
        process.exit(1);
    }

    const db = await getDb();

    const existing = await db.query<[unknown[]]>(
        "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
        { email },
    );

    if ((existing[0]?.length ?? 0) > 0) {
        console.log(`Usuário já existe: ${email}`);
        process.exit(0);
    }

    const password_hash = await hashPassword(plain);
    await db.insert(new Table("portal_user"), {
        email,
        password_hash,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });

    console.log(`Usuário criado: ${email}`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
