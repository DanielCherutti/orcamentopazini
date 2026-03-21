import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const PREFIX = "scrypt:v1";

/** Gera string persistível: scrypt:v1:<salt_hex>:<hash_hex> */
export async function hashPassword(plain: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
    return `${PREFIX}:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(
    plain: string,
    stored: string,
): Promise<boolean> {
    const parts = stored.split(":");
    if (parts.length !== 4 || parts[0] !== "scrypt" || parts[1] !== "v1") {
        return false;
    }
    const salt = parts[2];
    const hashHex = parts[3];
    if (!salt || !hashHex) return false;
    try {
        const derived = (await scryptAsync(plain, salt, 64)) as Buffer;
        const expected = Buffer.from(hashHex, "hex");
        if (derived.length !== expected.length) return false;
        return timingSafeEqual(derived, expected);
    } catch {
        return false;
    }
}
