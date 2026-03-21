
import { NextRequest, NextResponse } from "next/server";
import { saveFile } from "@/lib/upload";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const { id } = await params;
        const sanitizedId = id.replace(":", "_");
        const url = await saveFile(file, `products/${sanitizedId}/attachments`);

        return NextResponse.json({
            filename: file.name,
            url,
            type: file.type
        });
    } catch (error) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
