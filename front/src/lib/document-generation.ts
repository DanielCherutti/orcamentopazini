import { Table } from "surrealdb";
import { generateDatabookPdf } from "@/lib/databooks/generate-databook-pdf";
import { generateBudgetPdfBuffer } from "@/lib/pdf/generate-budget-pdf-buffer";
import { estimateRemainingTime } from "@/lib/databooks/domain";
import { saveUploadBuffer } from "@/lib/upload";
import { getDb } from "@/lib/surreal";
import { recordIdToString, requireRecordId } from "@/lib/surreal-record-ids";

export type GenerationDocumentType = "budget" | "databook";

export async function createGenerationJob(input: {
    documentType: GenerationDocumentType;
    documentId: string;
    tenantId: string;
    requestedBy: string;
    totalItems: number;
}) {
    const db = await getDb();
    const now = new Date().toISOString();
    const created = await db.create(new Table("document_generation_job")).content({
        tenant_id: requireRecordId("tenant", input.tenantId),
        document_type: input.documentType,
        document_id: requireRecordId(input.documentType, input.documentId),
        status: "queued",
        phase: "queued",
        phase_label: "Na fila para geração",
        progress: 0,
        processed_items: 0,
        total_items: Math.max(1, input.totalItems),
        elapsed_seconds: 0,
        estimated_remaining_seconds: null,
        estimate_confidence: "low",
        message: "Aguardando início",
        attempts: 1,
        requested_by: input.requestedBy,
        created_at: now,
        updated_at: now,
    });
    return recordIdToString(((Array.isArray(created) ? created[0] : created) as Record<string, unknown>).id);
}

async function updateJob(jobId: string, patch: Record<string, unknown>) {
    const db = await getDb();
    await db.update(requireRecordId("document_generation_job", jobId)).merge({
        ...patch,
        updated_at: new Date().toISOString(),
    });
}

export async function claimAndRunGenerationJob(jobId: string, input: {
    documentType: GenerationDocumentType;
    documentId: string;
    totalItems: number;
    origin?: string;
}) {
    const db = await getDb();
    const claimed = await db.query<[Array<Record<string, unknown>>]>(
        `UPDATE $id SET status = "preparing", phase = "preparing",
         phase_label = "Preparando documento", message = "Iniciando geração",
         started_at = time::now(), updated_at = time::now()
         WHERE status = "queued" RETURN AFTER`,
        { id: requireRecordId("document_generation_job", jobId) },
    );
    if (!claimed[0]?.length) return { started: false };
    await runGenerationJob(jobId, input);
    return { started: true };
}

export async function runGenerationJob(jobId: string, input: {
    documentType: GenerationDocumentType;
    documentId: string;
    startedAt?: Date;
    totalItems: number;
    origin?: string;
}) {
    const startedAt = input.startedAt ?? new Date();
    const progress = async (value: number, phase: string, label: string, processed: number, message: string) => {
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000));
        const eta = estimateRemainingTime({ progress: value, elapsedSeconds });
        await updateJob(jobId, {
            status: phase,
            phase,
            phase_label: label,
            progress: value,
            processed_items: processed,
            elapsed_seconds: elapsedSeconds,
            estimated_remaining_seconds: eta.seconds,
            estimate_confidence: eta.confidence,
            message,
            started_at: startedAt.toISOString(),
        });
    };
    try {
        await progress(5, "preparing", "Preparando documento", 0, "Validando conteúdo e arquivos");
        await progress(15, "rendering_content", "Renderizando conteúdo", 0, "Montando páginas do documento");
        const result = input.documentType === "databook"
            ? await generateDatabookPdf(input.documentId)
            : await generateBudgetPdfBuffer(input.documentId, { pdfRequestOrigin: input.origin });
        if (!result.ok) throw new Error(result.error);
        await progress(90, "finalizing", "Finalizando PDF", input.totalItems, "Gravando arquivo final");
        const url = await saveUploadBuffer(
            result.buffer,
            `document-generations/${jobId.replace(":", "_")}`,
            result.filename,
        );
        const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 1000));
        await updateJob(jobId, {
            status: "completed",
            phase: "completed",
            phase_label: "PDF concluído",
            progress: 100,
            processed_items: input.totalItems,
            elapsed_seconds: elapsedSeconds,
            estimated_remaining_seconds: 0,
            estimate_confidence: "high",
            message: "Arquivo pronto para download",
            output_file: url,
            output_filename: result.filename,
            file_size: result.buffer.length,
            page_count: "pageCount" in result ? result.pageCount : null,
            finished_at: new Date().toISOString(),
        });
        if (input.documentType === "databook") {
            const db = await getDb();
            await db.update(requireRecordId("databook", input.documentId)).merge({
                pdf_outdated: false,
                last_pdf_file: url,
                last_generation_job_id: requireRecordId("document_generation_job", jobId),
                updated_at: new Date().toISOString(),
            });
        }
    } catch (error) {
        console.error("runGenerationJob:", jobId, error);
        await updateJob(jobId, {
            status: "failed",
            phase: "failed",
            phase_label: "Falha na geração",
            message: error instanceof Error ? error.message.slice(0, 500) : "Falha ao gerar PDF",
            finished_at: new Date().toISOString(),
        });
    }
}
