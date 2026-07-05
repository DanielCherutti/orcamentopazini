"use server";

import { Table } from "surrealdb";
import { z } from "zod";
import { assertWriteActionSession } from "@/actions/auth-actions";
import { auditTenantAction } from "@/lib/audit-log";
import { getDb, isTokenExpiredError, resetDb, toPlain } from "@/lib/surreal";
import { requireActiveTenantId, tenantRecordId } from "@/lib/tenant-query";

export type LibraryFont = {
  id: string;
  name: string;
  family: string;
  url: string;
  format: "ttf" | "otf" | "woff" | "woff2";
  created_at?: string;
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  family: z.string().trim().min(1).max(100),
  url: z.string().trim().min(1),
  format: z.enum(["ttf", "otf", "woff", "woff2"]),
});

function safeId(id: unknown): string {
  if (id && typeof id === "object" && "toString" in id) {
    return String((id as { toString(): string }).toString());
  }
  return String(id ?? "");
}

function serializeFont(row: Record<string, unknown>): LibraryFont {
  return {
    id: safeId(row.id),
    name: String(row.name ?? ""),
    family: String(row.family ?? ""),
    url: String(row.url ?? ""),
    format: String(row.format ?? "ttf") as LibraryFont["format"],
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export async function getLibraryFontsAction() {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };
  try {
    const db = await getDb();
    const tenantId = await requireActiveTenantId();
    const result = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM font_library
       WHERE tenant_id = $tenantId
       ORDER BY name ASC LIMIT 200`,
      { tenantId: tenantRecordId(tenantId) },
    );
    return { success: true, data: toPlain((result[0] ?? []).map(serializeFont)) };
  } catch (error) {
    console.error("getLibraryFontsAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao carregar fontes" };
  }
}

export async function createLibraryFontAction(input: {
  name: string;
  family: string;
  url: string;
  format: LibraryFont["format"];
}) {
  const auth = await assertWriteActionSession();
  if (!auth.ok) return { success: false, error: auth.error };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dados da fonte inválidos" };
  try {
    const db = await getDb();
    const tenantId = await requireActiveTenantId();
    const created = await db.create(new Table("font_library")).content({
      ...parsed.data,
      tenant_id: tenantRecordId(tenantId),
      created_at: new Date().toISOString(),
    });
    const row = Array.isArray(created) ? created[0] : created;
    const font = serializeFont(row as unknown as Record<string, unknown>);
    await auditTenantAction({
      action: "font_library.create",
      resourceType: "font_library",
      resourceId: font.id,
      summary: `Fonte adicionada: ${font.name}`,
    });
    return { success: true, data: toPlain(font) };
  } catch (error) {
    console.error("createLibraryFontAction:", error);
    if (isTokenExpiredError(error)) resetDb();
    return { success: false, error: "Falha ao salvar fonte" };
  }
}
