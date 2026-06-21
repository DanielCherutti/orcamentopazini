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
import { StringRecordId, Table } from "surrealdb";
import { getDb } from "./src/lib/surreal";
import { hashPassword } from "./src/lib/password";
import { DEFAULT_TENANT_RECORD_ID } from "./src/lib/tenant-constants";
import { recordIdToString } from "./src/lib/surreal-record-ids";

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

    const existing = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM portal_user WHERE email = $email LIMIT 1",
        { email },
    );

    const existingUser = existing[0]?.[0];
    if (existingUser?.id) {
        const userId = recordIdToString(existingUser.id);
        if (userId) {
            const link = await db.query<[unknown[]]>(
                "SELECT id FROM portal_user_tenant WHERE user_id = $userId AND tenant_id = $tenantId LIMIT 1",
                {
                    userId: new StringRecordId(userId),
                    tenantId: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
                },
            );
            if ((link[0]?.length ?? 0) === 0) {
                await db.create(new Table("portal_user_tenant")).content({
                    user_id: new StringRecordId(userId),
                    tenant_id: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
                    role: "admin",
                    created_at: new Date().toISOString(),
                });
                console.log(`Membership criada para usuário existente: ${email}`);
            }
        }
        console.log(`Usuário já existe: ${email}`);
        process.exit(0);
    }

    const password_hash = await hashPassword(plain);
    const inserted = await db.insert(new Table("portal_user"), {
        email,
        password_hash,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    });
    const userRow = Array.isArray(inserted) ? inserted[0] : inserted;
    const userId = recordIdToString((userRow as { id: unknown }).id);

    if (userId) {
        await db.create(new Table("portal_user_tenant")).content({
            user_id: new StringRecordId(userId),
            tenant_id: new StringRecordId(DEFAULT_TENANT_RECORD_ID),
            role: "admin",
            created_at: new Date().toISOString(),
        });
    }

    console.log(`Usuário criado: ${email} (tenant ${DEFAULT_TENANT_RECORD_ID})`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
