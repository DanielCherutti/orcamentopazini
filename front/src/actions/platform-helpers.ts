import type { Surreal } from "surrealdb";

import { InvalidRecordIdError, recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

/** Resolve slug (`pazini`) ou record id (`tenant:pazini`) para StringRecordId. */
export async function resolveTenantRef(db: Surreal, ref: string) {
    const decoded = decodeURIComponent(ref).trim();
    if (!decoded) throw new InvalidRecordIdError();

    try {
        return requireRecordId("tenant", decoded);
    } catch (e) {
        if (!(e instanceof InvalidRecordIdError)) throw e;
    }

    const slug = decoded.toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
        throw new InvalidRecordIdError();
    }

    const rows = await db.query<[Array<{ id: unknown }>]>(
        "SELECT id FROM tenant WHERE slug = $slug AND deleted_at IS NONE LIMIT 1",
        { slug },
    );
    const id = recordIdToString(rows[0]?.[0]?.id);
    if (!id) throw new InvalidRecordIdError();
    return requireRecordId("tenant", id);
}
