import { z } from "zod";
import type {
    AttachmentKind,
    DocumentGenerationProgress,
    ManualAuthorship,
    ProductManual,
    TechnicalTableSchema,
} from "@/types/databook-types";

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const technicalTableSchemaValidator = z
    .object({
        version: z.literal(1),
        rows: z.number().int().min(1).max(100),
        columns: z
            .array(
                z.object({
                    id: z.string().min(1).max(80),
                    width: z.number().min(20).max(2000).optional(),
                }),
            )
            .min(1)
            .max(20),
        cells: z
            .array(
                z.object({
                    id: z.string().min(1).max(80),
                    row: z.number().int().min(0),
                    column: z.number().int().min(0),
                    rowSpan: z.number().int().min(1).max(100).optional(),
                    columnSpan: z.number().int().min(1).max(20).optional(),
                    kind: z.enum([
                        "label",
                        "value",
                        "fixed",
                        "variable",
                        "input",
                        "long_text",
                        "select",
                        "boolean",
                        "date",
                    ]),
                    key: z.string().min(1).max(120).optional(),
                    label: z.string().max(500).optional(),
                    defaultValue: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
                    variable: z.string().max(200).optional(),
                    required: z.boolean().optional(),
                    placeholder: z.string().max(500).optional(),
                    options: z.array(z.string().max(200)).max(100).optional(),
                    style: z
                        .object({
                            align: z.enum(["left", "center", "right"]).optional(),
                            bold: z.boolean().optional(),
                            italic: z.boolean().optional(),
                            background: colorSchema.optional(),
                            borderColor: colorSchema.optional(),
                        })
                        .optional(),
                }),
            )
            .max(2000),
        tableWidthPercent: z.number().min(60).max(100).optional(),
        hideEmptyCells: z.boolean().optional(),
    })
    .superRefine((schema, ctx) => {
        const occupied = new Set<string>();
        const columnCount = schema.columns.length;
        for (const cell of schema.cells) {
            const rowSpan = cell.rowSpan ?? 1;
            const columnSpan = cell.columnSpan ?? 1;
            if (cell.row + rowSpan > schema.rows || cell.column + columnSpan > columnCount) {
                ctx.addIssue({
                    code: "custom",
                    path: ["cells", cell.id],
                    message: "A célula ultrapassa os limites da tabela",
                });
                continue;
            }
            for (let row = cell.row; row < cell.row + rowSpan; row += 1) {
                for (let column = cell.column; column < cell.column + columnSpan; column += 1) {
                    const coordinate = `${row}:${column}`;
                    if (occupied.has(coordinate)) {
                        ctx.addIssue({
                            code: "custom",
                            path: ["cells", cell.id],
                            message: "Há células mescladas sobrepostas",
                        });
                    }
                    occupied.add(coordinate);
                }
            }
        }
        const keys = schema.cells.map((cell) => cell.key).filter(Boolean);
        if (new Set(keys).size !== keys.length) {
            ctx.addIssue({ code: "custom", path: ["cells"], message: "As chaves devem ser únicas" });
        }
    });

export const DEFAULT_TECHNICAL_TABLE_SCHEMA: TechnicalTableSchema = {
    version: 1,
    tableWidthPercent: 82,
    rows: 10,
    columns: [
        { id: "label_a", width: 180 },
        { id: "value_a", width: 260 },
        { id: "label_b", width: 180 },
        { id: "value_b", width: 260 },
    ],
    cells: [
        { id: "description_label", row: 0, column: 0, kind: "label", label: "Descrição do equipamento" },
        { id: "description", row: 0, column: 1, columnSpan: 3, kind: "variable", key: "product_description", variable: "produto.descricao" },
        { id: "building_label", row: 1, column: 0, kind: "label", label: "Identificação da edificação" },
        { id: "building", row: 1, column: 1, columnSpan: 3, kind: "variable", key: "installation_location", variable: "instalacao.local" },
        { id: "manual_label", row: 2, column: 0, kind: "label", label: "Manual técnico" },
        { id: "manual", row: 2, column: 1, kind: "variable", key: "manual_reference", variable: "manual.referencia" },
        { id: "manufacturer_label", row: 2, column: 2, kind: "label", label: "Fabricante" },
        { id: "manufacturer", row: 2, column: 3, kind: "variable", key: "manufacturer", variable: "produto.fabricante" },
        ...[
            ["installation_number", "Número da instalação", "seal_number", "Número do lacre"],
            ["serial_number", "Número de série", "manufacture_year", "Ano da fabricação"],
            ["users", "Número de usuários", "fixing_method", "Método de fixação"],
            ["traction_test", "Ensaio de tração", "fit_for_use", "Apto para uso"],
            ["max_deflection", "Deflexão máx. cabo (m)", "absorbers", "Nº de absorvedores"],
        ].flatMap(([keyA, labelA, keyB, labelB], index) => {
            const row = index + 3;
            return [
                { id: `${keyA}_label`, row, column: 0, kind: "label" as const, label: labelA },
                { id: keyA, row, column: 1, kind: "input" as const, key: keyA },
                { id: `${keyB}_label`, row, column: 2, kind: "label" as const, label: labelB },
                { id: keyB, row, column: 3, kind: keyB === "fit_for_use" ? "boolean" as const : "input" as const, key: keyB },
            ];
        }),
        { id: "structural_label", row: 8, column: 0, kind: "label", label: "Avaliação estrutural" },
        { id: "structural", row: 8, column: 1, columnSpan: 3, kind: "long_text", key: "structural_evaluation" },
        { id: "notes_label", row: 9, column: 0, kind: "label", label: "Observações gerais" },
        { id: "notes", row: 9, column: 1, columnSpan: 3, kind: "long_text", key: "general_observations" },
    ],
};

export function hierarchicalInstallationNumber(installationIndex: number, productIndex?: number, suffix?: string): string {
    const base = productIndex == null ? `${installationIndex + 1}` : `${installationIndex + 1}.${productIndex + 1}`;
    return suffix?.trim() ? `${base}.${suffix.trim().replace(/^\.+/, "")}` : base;
}

export function alphabeticReference(index: number): string {
    if (!Number.isInteger(index) || index < 0) throw new Error("Índice inválido");
    let value = index + 1;
    let output = "";
    while (value > 0) {
        value -= 1;
        output = String.fromCharCode(65 + (value % 26)) + output;
        value = Math.floor(value / 26);
    }
    return output;
}

export function attachmentKindForAuthorship(authorship: ManualAuthorship): AttachmentKind {
    return authorship === "internal" ? "appendix" : "annex";
}

export function consolidateManuals(manuals: ProductManual[]): Array<ProductManual & { kind: AttachmentKind; reference: string }> {
    const seen = new Set<string>();
    const counters: Record<AttachmentKind, number> = { annex: 0, appendix: 0 };
    return manuals.flatMap((manual) => {
        const identity = `${manual.id}@${manual.edition ?? manual.checksum ?? ""}`;
        if (!manual.active || seen.has(identity)) return [];
        seen.add(identity);
        const kind = attachmentKindForAuthorship(manual.authorship);
        const reference = `${kind === "annex" ? "Anexo" : "Apêndice"} ${alphabeticReference(counters[kind]++)}`;
        return [{ ...manual, kind, reference }];
    });
}

export type EtaSample = {
    progress: number;
    elapsedSeconds: number;
    previousRate?: number | null;
    smoothing?: number;
};

export function estimateRemainingTime(sample: EtaSample): { seconds: number | null; rate: number | null; confidence: "low" | "medium" | "high" } {
    const progress = Math.max(0, Math.min(100, sample.progress));
    if (progress <= 0 || sample.elapsedSeconds <= 0 || progress >= 100) {
        return { seconds: progress >= 100 ? 0 : null, rate: null, confidence: "low" };
    }
    const observedRate = progress / sample.elapsedSeconds;
    const alpha = Math.max(0.05, Math.min(1, sample.smoothing ?? 0.3));
    const rate = sample.previousRate && sample.previousRate > 0
        ? alpha * observedRate + (1 - alpha) * sample.previousRate
        : observedRate;
    const seconds = Math.max(0, Math.round((100 - progress) / rate));
    return {
        seconds,
        rate,
        confidence: progress >= 50 ? "high" : progress >= 15 ? "medium" : "low",
    };
}

export function buildGenerationProgress(input: Omit<DocumentGenerationProgress, "progress" | "elapsedSeconds" | "estimatedRemainingSeconds" | "estimateConfidence"> & {
    startedAt: Date;
    now?: Date;
    previousRate?: number | null;
}): DocumentGenerationProgress & { rate: number | null } {
    const elapsedSeconds = Math.max(0, Math.floor(((input.now ?? new Date()).getTime() - input.startedAt.getTime()) / 1000));
    const progress = input.totalItems > 0
        ? Math.max(0, Math.min(100, (input.processedItems / input.totalItems) * 100))
        : 0;
    const estimate = estimateRemainingTime({ progress, elapsedSeconds, previousRate: input.previousRate });
    return { ...input, progress, elapsedSeconds, estimatedRemainingSeconds: estimate.seconds, estimateConfidence: estimate.confidence, rate: estimate.rate };
}
