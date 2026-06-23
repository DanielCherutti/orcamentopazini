import { Buffer } from "node:buffer";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-session";
import { assertEntityBelongsToTenant } from "@/lib/tenant-access";
import { saveUploadBuffer, uploadPersistErrorResponse } from "@/lib/upload";
import { IMAGE_UPLOAD_MAX_BYTES, validateImageBuffer } from "@/lib/upload-validation";

export async function POST(request: NextRequest) {
  const session = await requireApiSession(request);
  if (!session.ok) return session.response;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const customerId = formData.get("customerId")?.toString().trim() ?? "";

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    if (customerId) {
      const gate = await assertEntityBelongsToTenant(
        "client",
        customerId,
        session.ctx.tenantId,
        "Cliente não encontrado",
      );
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: 404 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const validationError = validateImageBuffer(buffer, IMAGE_UPLOAD_MAX_BYTES);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const tenantFolder = session.ctx.tenantId.replace(":", "_");
    const url = await saveUploadBuffer(
      buffer,
      `customers/${tenantFolder}/logos`,
      file.name,
    );

    return NextResponse.json({ url });
  } catch (error) {
    return uploadPersistErrorResponse(error);
  }
}

