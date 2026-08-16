"use client";

import { useState, useTransition } from "react";
import {
    createProductManualAction,
    saveProductDatabookConfigAction,
    type ProductDatabookConfig,
} from "@/actions/product-databook-actions";
import { DEFAULT_TECHNICAL_TABLE_SCHEMA } from "@/lib/databooks/domain";
import { toast } from "@/lib/toast";
import type { ProductManual, TechnicalTableCell, TechnicalTableSchema } from "@/types/databook-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProductDatabookPanel({
    productId,
    initialConfig,
    initialManuals,
    view = "table",
}: {
    productId: string;
    initialConfig: ProductDatabookConfig;
    initialManuals: ProductManual[];
    view?: "table" | "manuals";
}) {
    const [config, setConfig] = useState(initialConfig);
    const [manuals, setManuals] = useState(initialManuals);
    const [pending, startTransition] = useTransition();
    const [manualFile, setManualFile] = useState<{ url: string; filename: string } | null>(null);
    const [manualTitle, setManualTitle] = useState("");
    const [authorship, setAuthorship] = useState<"internal" | "external">("internal");

    const save = () => startTransition(async () => {
        const result = await saveProductDatabookConfigAction(productId, config);
        if (result.success) toast.success("Configuração do DataBook salva");
        else toast.error(result.error ?? "Erro ao salvar");
    });

    const upload = async (file: File) => {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(`/api/upload/product/${encodeURIComponent(productId)}/manual`, { method: "POST", body: form });
        const body = await response.json() as { url?: string; filename?: string; error?: string };
        if (!response.ok || !body.url) return toast.error(body.error ?? "Erro no upload");
        setManualFile({ url: body.url, filename: body.filename ?? file.name });
        if (!manualTitle) setManualTitle(file.name.replace(/\.pdf$/i, ""));
    };

    const addManual = () => {
        if (!manualFile) return toast.error("Envie o PDF do manual");
        startTransition(async () => {
            const result = await createProductManualAction(productId, {
                title: manualTitle,
                file_url: manualFile.url,
                filename: manualFile.filename,
                authorship,
                active: true,
            });
            if (!result.success || !result.id) {
                toast.error(result.error ?? "Erro ao incluir manual");
                return;
            }
            setManuals((current) => [...current, {
                id: result.id!,
                product_id: productId,
                title: manualTitle,
                file_url: manualFile.url,
                filename: manualFile.filename,
                mime_type: "application/pdf",
                authorship,
                active: true,
            }]);
            setManualFile(null);
            setManualTitle("");
            toast.success(authorship === "internal" ? "Manual será incluído como Apêndice" : "Manual será incluído como Anexo");
        });
    };

    if (view === "manuals") return (
        <Card>
            <CardHeader><CardTitle>Manuais do produto</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Envie os manuais em PDF e informe a autoria. Documentos próprios serão apresentados como apêndices; documentos externos, como anexos.</p>
                {manuals.length === 0 ? <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum manual cadastrado para este produto.</div> : null}
                {manuals.map((manual) => (
                    <div key={manual.id} className="flex items-center justify-between rounded border p-3">
                        <div><p className="font-medium">{manual.title}</p><p className="text-xs text-muted-foreground">{manual.filename}</p></div>
                        <Badge variant="outline">{manual.authorship === "internal" ? "Apêndice" : "Anexo"}</Badge>
                    </div>
                ))}
                <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Arquivo PDF</Label><Input type="file" accept="application/pdf,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></div>
                    <div className="space-y-2"><Label>Título do manual</Label><Input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} /></div>
                    <div className="space-y-2"><Label>Autoria do documento</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={authorship} onChange={(event) => setAuthorship(event.target.value as "internal" | "external")}><option value="internal">Autoria própria — Apêndice</option><option value="external">Autoria externa — Anexo</option></select></div>
                    <div className="flex items-end"><Button type="button" disabled={pending || !manualFile} onClick={addManual}>Adicionar manual</Button></div>
                </div>
            </CardContent>
        </Card>
    );

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader><CardTitle>Tabela de informações do DataBook</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                    <p className="text-sm text-muted-foreground">Esta estrutura é copiada como snapshot ao inserir o produto em um DataBook.</p>
                    <div className="space-y-2">
                        <Label>Fabricante</Label>
                        <Input value={config.manufacturer ?? ""} onChange={(event) => setConfig((current) => ({ ...current, manufacturer: event.target.value }))} />
                    </div>
                    <TechnicalTableEditor
                        value={config.table_schema}
                        onChange={(table_schema) => setConfig((current) => ({ ...current, table_schema }))}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2"><Label>Avaliação estrutural padrão</Label><Textarea value={config.default_structural_evaluation ?? ""} onChange={(event) => setConfig((current) => ({ ...current, default_structural_evaluation: event.target.value }))} /></div>
                        <div className="space-y-2"><Label>Observações gerais padrão</Label><Textarea value={config.default_general_observations ?? ""} onChange={(event) => setConfig((current) => ({ ...current, default_general_observations: event.target.value }))} /></div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" type="button" onClick={() => setConfig((current) => ({ ...current, table_schema: structuredClone(DEFAULT_TECHNICAL_TABLE_SCHEMA) }))}>Restaurar padrão</Button>
                        <Button type="button" disabled={pending} onClick={save}>{pending ? "Salvando..." : "Salvar configuração"}</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function TechnicalTableEditor({ value, onChange }: { value: TechnicalTableSchema; onChange: (value: TechnicalTableSchema) => void }) {
    const changeCell = (id: string, patch: Partial<TechnicalTableCell>) =>
        onChange({ ...value, cells: value.cells.map((cell) => cell.id === id ? { ...cell, ...patch } : cell) });
    const addRow = () => onChange({ ...value, rows: value.rows + 1 });
    const addColumn = () => onChange({ ...value, columns: [...value.columns, { id: crypto.randomUUID(), width: 180 }] });
    const removeLastRow = () => {
        if (value.rows <= 1) return;
        const last = value.rows - 1;
        onChange({ ...value, rows: last, cells: value.cells.filter((cell) => cell.row < last) });
    };
    const removeLastColumn = () => {
        if (value.columns.length <= 1) return;
        const last = value.columns.length - 1;
        onChange({
            ...value,
            columns: value.columns.slice(0, -1),
            cells: value.cells
                .filter((cell) => cell.column < last)
                .map((cell) => ({
                    ...cell,
                    columnSpan: Math.min(cell.columnSpan ?? 1, last - cell.column) || 1,
                })),
        });
    };
    const addCell = () => {
        const occupied = new Set<string>();
        value.cells.forEach((cell) => {
            for (let row = cell.row; row < cell.row + (cell.rowSpan ?? 1); row += 1) {
                for (let column = cell.column; column < cell.column + (cell.columnSpan ?? 1); column += 1) {
                    occupied.add(`${row}:${column}`);
                }
            }
        });
        for (let row = 0; row < value.rows; row += 1) for (let column = 0; column < value.columns.length; column += 1) {
            if (!occupied.has(`${row}:${column}`)) {
                onChange({ ...value, cells: [...value.cells, { id: crypto.randomUUID(), row, column, kind: "input", key: `campo_${value.cells.length + 1}` }] });
                return;
            }
        }
        toast.error("Não há célula livre; adicione uma linha ou coluna");
    };
    return (
        <div className="space-y-6">
            <section className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <div>
                    <h3 className="font-semibold">Estrutura da tabela</h3>
                    <p className="text-sm text-muted-foreground">Organize as células como elas deverão aparecer no laudo. Os nomes técnicos ficam disponíveis apenas em “Configuração avançada”.</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-800">Rótulo</p><p className="text-[11px] text-blue-700">Título que identifica a informação.</p></div>
                    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-800">Automático</p><p className="text-[11px] text-violet-700">Vem do produto, instalação ou manual.</p></div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-800">Valor fixo</p><p className="text-[11px] text-amber-700">Definido uma vez neste produto.</p></div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">Preenchível</p><p className="text-[11px] text-emerald-700">Será informado em cada instalação.</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" type="button" onClick={addRow}>+ Linha</Button>
                    <Button size="sm" variant="outline" type="button" onClick={removeLastRow} disabled={value.rows <= 1}>− Última linha</Button>
                    <Button size="sm" variant="outline" type="button" onClick={addColumn}>+ Coluna</Button>
                    <Button size="sm" variant="outline" type="button" onClick={removeLastColumn} disabled={value.columns.length <= 1}>− Última coluna</Button>
                    <Button size="sm" type="button" onClick={addCell}>Adicionar célula no primeiro espaço vazio</Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {value.columns.map((column, index) => (
                        <label key={column.id} className="rounded-lg border bg-background p-3 text-xs">
                            <span className="mb-1 block font-medium">Largura da coluna {index + 1}</span>
                            <Input
                                className="h-8"
                                type="number"
                                min={20}
                                max={2000}
                                value={column.width ?? 180}
                                onChange={(event) => onChange({
                                    ...value,
                                    columns: value.columns.map((item) => item.id === column.id ? { ...item, width: Number(event.target.value) || 180 } : item),
                                })}
                            />
                        </label>
                    ))}
                </div>
                <div className="rounded-lg border bg-background p-4">
                    <div className="mb-3 flex items-center justify-between gap-4">
                        <div>
                            <Label htmlFor="databook-table-width">Largura da tabela no PDF</Label>
                            <p className="text-xs text-muted-foreground">A régua controla quanto da área útil da página será ocupado. A tabela permanecerá centralizada.</p>
                        </div>
                        <Badge variant="outline">{value.tableWidthPercent ?? 82}%</Badge>
                    </div>
                    <input
                        id="databook-table-width"
                        type="range"
                        min={60}
                        max={100}
                        step={1}
                        value={value.tableWidthPercent ?? 82}
                        onChange={(event) => onChange({ ...value, tableWidthPercent: Number(event.target.value) })}
                        className="h-2 w-full cursor-pointer accent-[#315b9b]"
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                        <span>60% — estreita</span>
                        <span>80% — recomendada</span>
                        <span>100% — largura total</span>
                    </div>
                </div>
                <div className="overflow-x-auto rounded-lg border bg-background p-2">
                    <div className="grid min-w-[820px] gap-2" style={{ gridTemplateColumns: previewColumns(value), gridTemplateRows: `repeat(${value.rows}, minmax(132px, auto))` }}>
                        {[...value.cells].sort((a, b) => a.row - b.row || a.column - b.column).map((cell) => (
                            <div key={cell.id} className={`space-y-3 rounded-lg border-l-4 p-3 shadow-sm ${CELL_VISUALS[cell.kind].card}`} style={{ gridColumn: `${cell.column + 1} / span ${cell.columnSpan ?? 1}`, gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}` }}>
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <Badge className={`border-0 text-[10px] ${CELL_VISUALS[cell.kind].badge}`}>{CELL_VISUALS[cell.kind].category}</Badge>
                                        <p className="mt-1 text-[11px] text-muted-foreground">Linha {cell.row + 1} · Coluna {cell.column + 1}</p>
                                    </div>
                                    <button type="button" className="text-destructive hover:underline" onClick={() => onChange({ ...value, cells: value.cells.filter((item) => item.id !== cell.id) })}>Excluir célula</button>
                                </div>
                                {cell.kind !== "fixed" ? <div className="space-y-1">
                                    <Label className="text-xs">{cell.kind === "label" ? "Texto do rótulo" : "Nome apresentado"}</Label>
                                    <Input className="h-8" value={cell.label ?? ""} placeholder={cell.kind === "label" ? "Ex.: Número de série" : "Opcional"} onChange={(event) => changeCell(cell.id, { label: event.target.value })} />
                                </div> : null}
                                <div className="space-y-1">
                                    <Label className="text-xs">Tipo de conteúdo</Label>
                                    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={cell.kind} onChange={(event) => changeCell(cell.id, { kind: event.target.value as TechnicalTableCell["kind"] })}>
                                        {Object.entries(CELL_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                                    </select>
                                </div>
                                {cell.kind === "fixed" ? <div className="space-y-1">
                                    <Label className="text-xs">Valor fixo</Label>
                                    <Input
                                        className="h-8"
                                        value={String(cell.defaultValue ?? cell.label ?? "")}
                                        placeholder="Ex.: 2026 ou 123123"
                                        onChange={(event) => changeCell(cell.id, { defaultValue: event.target.value, label: undefined })}
                                    />
                                    <p className="text-[11px] text-muted-foreground">Este conteúdo será inserido automaticamente em todos os DataBooks que usarem este produto.</p>
                                </div> : null}
                                {cell.kind === "variable" ? <div className="space-y-1">
                                    <Label className="text-xs">Informação automática</Label>
                                    <select className="h-8 w-full rounded-md border bg-background px-2 text-xs" value={cell.variable ?? ""} onChange={(event) => changeCell(cell.id, { variable: event.target.value })}>
                                        <option value="">Selecione...</option>
                                        {Object.entries(VARIABLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                    </select>
                                </div> : null}
                                {["input", "long_text", "select", "boolean", "date"].includes(cell.kind) ? <details>
                                    <summary className="cursor-pointer text-xs font-medium text-primary">Configuração avançada</summary>
                                    <div className="mt-2 space-y-2">
                                        <Input className="h-8" value={cell.key ?? ""} placeholder="Identificador interno do campo" onChange={(event) => changeCell(cell.id, { key: event.target.value.replace(/\s+/g, "_").toLowerCase() })} />
                                        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={cell.required === true} onChange={(event) => changeCell(cell.id, { required: event.target.checked })} />Preenchimento obrigatório</label>
                                    </div>
                                </details> : null}
                            </div>
                        ))}
                    </div>
                </div>
            </section>
            <section className="space-y-3">
                <div>
                    <h3 className="font-semibold">Prévia no DataBook</h3>
                    <p className="text-sm text-muted-foreground">Exemplo visual com dados fictícios. O conteúdo real será preenchido em cada instalação.</p>
                </div>
                <div className="overflow-x-auto rounded-xl border bg-white p-5 shadow-sm">
                    <div
                        className="mx-auto min-w-[620px] max-w-5xl"
                        style={{ width: `${value.tableWidthPercent ?? 82}%` }}
                    >
                        <div className="mb-3 border-y-2 border-[#315b9b] py-2 text-center text-xl font-bold text-[#315b9b]">INSTALAÇÃO 1.1 — PRODUTO INSTALADO</div>
                        <div className="grid overflow-hidden border border-[#afbdd4]" style={{ gridTemplateColumns: previewColumns(value), gridTemplateRows: `repeat(${value.rows}, minmax(30px, auto))` }}>
                            {[...value.cells].sort((a, b) => a.row - b.row || a.column - b.column).map((cell) => (
                                <div
                                    key={cell.id}
                                    className={`flex min-h-8 items-start border-b border-r border-[#c4cede] px-2 py-1 text-sm text-[#315b9b] ${cell.kind === "label" ? "font-bold" : "italic"}`}
                                    style={{
                                        gridColumn: `${cell.column + 1} / span ${cell.columnSpan ?? 1}`,
                                        gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}`,
                                        background: cell.row % 2 === 0 ? "#dce4f2" : "#f5f7fb",
                                    }}
                                >
                                    {previewCellValue(cell)}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

const CELL_VISUALS: Record<TechnicalTableCell["kind"], { category: string; card: string; badge: string }> = {
    label: { category: "RÓTULO", card: "border-blue-400 bg-blue-50/70", badge: "bg-blue-100 text-blue-800 hover:bg-blue-100" },
    variable: { category: "AUTOMÁTICO", card: "border-violet-400 bg-violet-50/70", badge: "bg-violet-100 text-violet-800 hover:bg-violet-100" },
    fixed: { category: "VALOR FIXO", card: "border-amber-400 bg-amber-50/70", badge: "bg-amber-100 text-amber-800 hover:bg-amber-100" },
    input: { category: "PREENCHÍVEL", card: "border-emerald-400 bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
    long_text: { category: "PREENCHÍVEL", card: "border-emerald-400 bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
    select: { category: "PREENCHÍVEL", card: "border-emerald-400 bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
    boolean: { category: "PREENCHÍVEL", card: "border-emerald-400 bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
    date: { category: "PREENCHÍVEL", card: "border-emerald-400 bg-emerald-50/70", badge: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" },
    value: { category: "VALOR", card: "border-slate-400 bg-slate-50", badge: "bg-slate-200 text-slate-800 hover:bg-slate-200" },
};

const CELL_KIND_LABELS: Record<TechnicalTableCell["kind"], string> = {
    label: "Rótulo em destaque",
    value: "Valor",
    fixed: "Valor fixo — sempre igual",
    variable: "Informação preenchida automaticamente",
    input: "Preencher em cada DataBook — texto curto",
    long_text: "Preencher em cada DataBook — texto longo",
    select: "Preencher em cada DataBook — lista de opções",
    boolean: "Preencher em cada DataBook — sim ou não",
    date: "Preencher em cada DataBook — data",
};

const VARIABLE_LABELS: Record<string, string> = {
    "produto.descricao": "Descrição do produto",
    "produto.fabricante": "Fabricante",
    "instalacao.local": "Identificação da instalação/edificação",
    "manual.referencia": "Referência do manual (Anexo ou Apêndice)",
};

const SAMPLE_VALUES: Record<string, string> = {
    product_description: "Escada Marinheiro e Linha de Vida Vertical",
    installation_location: "Secador 01",
    manual_reference: "Apêndice A",
    manufacturer: "Pazini Engenharia",
    installation_number: "2",
    seal_number: "01101",
    serial_number: "16032026",
    manufacture_year: "2026",
    users: "2",
    fixing_method: "Parafusado na estrutura",
    traction_test: "N/I",
    fit_for_use: "Sim",
    max_deflection: "N/I",
    absorbers: "N/I",
    structural_evaluation: "Equipamento instalado conforme o projeto executivo e os critérios técnicos aplicáveis.",
    general_observations: "Instalação executada conforme os procedimentos e orientações técnicas.",
};

function previewColumns(schema: TechnicalTableSchema): string {
    return schema.columns.map((column) => `minmax(130px, ${Math.max(20, column.width ?? 180)}fr)`).join(" ");
}

function previewCellValue(cell: TechnicalTableCell): string {
    if (cell.kind === "label") return cell.label || "Rótulo";
    if (cell.kind === "fixed") return String(cell.defaultValue ?? cell.label ?? "Texto fixo");
    if (cell.variable === "produto.descricao") return SAMPLE_VALUES.product_description;
    if (cell.variable === "produto.fabricante") return SAMPLE_VALUES.manufacturer;
    if (cell.variable === "instalacao.local") return SAMPLE_VALUES.installation_location;
    if (cell.variable === "manual.referencia") return SAMPLE_VALUES.manual_reference;
    if (cell.key && SAMPLE_VALUES[cell.key]) return SAMPLE_VALUES[cell.key];
    if (cell.kind === "boolean") return "Sim";
    if (cell.kind === "date") return "24/07/2026";
    return cell.label || String(cell.defaultValue ?? "Valor a preencher");
}
