"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DatabookAreasEditor } from "@/components/databooks/databook-areas-editor";
import { importBuiltinMemorialToDatabookAction } from "@/actions/databook-template-actions";
import { toast } from "@/lib/toast";
import type { DatabookTemplate, DatabookTemplateArea, DatabookTemplateFile } from "@/types/databook-template-types";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="min-w-[140px]">
            {pending ? (
                <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Salvando...
                </>
            ) : isEditing ? (
                "Salvar DataBook"
            ) : (
                "Criar DataBook"
            )}
        </Button>
    );
}

interface DatabookTemplateFormProps {
    initialData?: DatabookTemplate;
    action: (formData: FormData) => Promise<void>;
    generalError?: string;
}

export function DatabookTemplateForm({
    initialData,
    action,
    generalError,
}: DatabookTemplateFormProps) {
    const [name, setName] = useState(initialData?.name ?? "");
    const [description, setDescription] = useState(initialData?.description ?? "");
    const [clientLabel, setClientLabel] = useState(initialData?.client_label ?? "");
    const [deadlineDays, setDeadlineDays] = useState(
        String(initialData?.default_deadline_days ?? 90),
    );
    const [isDefault, setIsDefault] = useState(initialData?.is_default ?? false);
    const [active, setActive] = useState(initialData?.active !== false);
    const [areas, setAreas] = useState<DatabookTemplateArea[]>(
        initialData?.areas?.length
            ? initialData.areas
            : [{ code: "AD-01", title: "Área 1", checklist: [{ text: "Item 1" }] }],
    );
    const [referenceFile, setReferenceFile] = useState<DatabookTemplateFile | null>(
        initialData?.reference_file ?? null,
    );

    const templateId = initialData?.id;

    const handleSubmit = async (formData: FormData) => {
        formData.set("name", name);
        formData.set("description", description);
        formData.set("client_label", clientLabel);
        formData.set("default_deadline_days", deadlineDays);
        formData.set("areas", JSON.stringify(areas));
        formData.set("reference_file", referenceFile ? JSON.stringify(referenceFile) : "");
        formData.set("is_default", isDefault ? "true" : "false");
        formData.set("active", active ? "true" : "false");
        await action(formData);
    };

    return (
        <form action={handleSubmit} className="space-y-4">
            {generalError ? (
                <Alert variant="destructive">
                    <AlertDescription>{generalError}</AlertDescription>
                </Alert>
            ) : null}

            <Tabs defaultValue="info">
                <TabsList>
                    <TabsTrigger value="info">Informações</TabsTrigger>
                    <TabsTrigger value="areas">Áreas e checklist</TabsTrigger>
                    <TabsTrigger value="reference">Memorial de referência</TabsTrigger>
                </TabsList>

                <TabsContent value="info" className="mt-4">
                    <Card>
                        <CardContent className="pt-6 grid gap-4 md:grid-cols-2">
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="name">Nome do DataBook</Label>
                                <Input
                                    id="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    placeholder="C.Vale — Adequação NR-12"
                                />
                            </div>
                            <div className="space-y-2 md:col-span-2">
                                <Label htmlFor="description">Descrição</Label>
                                <Textarea
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={2}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="client_label">Cliente / referência</Label>
                                <Input
                                    id="client_label"
                                    value={clientLabel}
                                    onChange={(e) => setClientLabel(e.target.value)}
                                    placeholder="C.Vale"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="deadline">Prazo padrão (dias)</Label>
                                <Input
                                    id="deadline"
                                    type="number"
                                    min={1}
                                    max={365}
                                    value={deadlineDays}
                                    onChange={(e) => setDeadlineDays(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    id="is_default"
                                    checked={isDefault}
                                    onCheckedChange={(v) => setIsDefault(v === true)}
                                />
                                <Label htmlFor="is_default">Usar como padrão ao abrir entrega</Label>
                            </div>
                            <div className="flex items-center gap-3">
                                <Checkbox
                                    id="active"
                                    checked={active}
                                    onCheckedChange={(v) => setActive(v === true)}
                                />
                                <Label htmlFor="active">Ativo</Label>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="areas" className="mt-4">
                    <Card>
                        <CardContent className="pt-6">
                            <p className="text-sm text-muted-foreground mb-4">
                                Defina as áreas (AD) e itens de checklist que serão copiados ao criar um
                                projeto de entrega.
                            </p>
                            <DatabookAreasEditor areas={areas} onChange={setAreas} />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="reference" className="mt-4">
                    <Card>
                        <CardContent className="pt-6">
                            {templateId ? (
                                <DatabookReferenceUpload
                                    templateId={templateId}
                                    file={referenceFile}
                                    onChange={setReferenceFile}
                                />
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    Salve o DataBook para anexar o memorial de referência (PDF).
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="flex justify-end">
                <SubmitButton isEditing={Boolean(templateId)} />
            </div>
        </form>
    );
}

function DatabookReferenceUpload({
    templateId,
    file,
    onChange,
}: {
    templateId: string;
    file: DatabookTemplateFile | null;
    onChange: (f: DatabookTemplateFile | null) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const [importing, setImporting] = useState(false);

    const handleImportFromRepo = async () => {
        setImporting(true);
        try {
            const res = await importBuiltinMemorialToDatabookAction(templateId);
            if (res.success && res.data) {
                onChange(res.data);
                toast.success("Memorial laudos tecnicos.pdf importado");
            } else {
                toast.error(res.error || "Não foi possível importar");
            }
        } finally {
            setImporting(false);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;
        setUploading(true);
        const formData = new FormData();
        formData.append("file", selected);
        try {
            const res = await fetch(
                `/api/upload/databook-template/${encodeURIComponent(templateId)}/reference`,
                { method: "POST", body: formData },
            );
            if (!res.ok) throw new Error("Falha no upload");
            const data = await res.json();
            onChange({
                id: data.id,
                filename: data.filename,
                url: data.url,
                type: data.type,
            });
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    return (
        <div className="space-y-2">
            <Label>Memorial / especificação de referência (PDF)</Label>
            <p className="text-xs text-muted-foreground">
                Opcional. Documento base para consulta da equipe. Incluído na pasta{" "}
                <code className="text-[11px]">referencia/</code> do pacote ZIP exportado.
            </p>
            {file ? (
                <div className="flex items-center justify-between rounded border p-3 text-sm gap-2">
                    <span className="truncate">{file.filename}</span>
                    <div className="flex gap-1 shrink-0">
                        <Button type="button" variant="ghost" size="sm" asChild>
                            <a href={file.url} target="_blank" rel="noreferrer">
                                Abrir
                            </a>
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
                            Remover
                        </Button>
                    </div>
                </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={importing || uploading}
                    onClick={handleImportFromRepo}
                >
                    {importing ? "Importando..." : "Importar laudos tecnicos.pdf"}
                </Button>
                <label>
                    <input
                        type="file"
                        className="hidden"
                        accept=".pdf,application/pdf"
                        onChange={handleUpload}
                        disabled={uploading || importing}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        asChild
                        disabled={uploading || importing}
                    >
                        <span>
                            {uploading ? "Enviando..." : file ? "Substituir PDF" : "Enviar outro PDF"}
                        </span>
                    </Button>
                </label>
            </div>
        </div>
    );
}
