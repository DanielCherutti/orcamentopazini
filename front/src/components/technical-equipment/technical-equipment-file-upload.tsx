"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileIcon, X, Loader2, Download } from "lucide-react";
import { toast } from "@/lib/toast";
import type { TechnicalEquipmentFile } from "@/types/technical-equipment-types";

interface TechnicalEquipmentFileUploadProps {
    equipmentId?: string;
    label: string;
    description?: string;
    accept?: string;
    required?: boolean;
    file: TechnicalEquipmentFile | null;
    kind: "manual" | "datasheet" | "certificate";
    onChange: (file: TechnicalEquipmentFile | null) => void;
}

export function TechnicalEquipmentFileUpload({
    equipmentId,
    label,
    description,
    accept = ".pdf,application/pdf",
    required,
    file,
    kind,
    onChange,
}: TechnicalEquipmentFileUploadProps) {
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected || !equipmentId) return;

        setUploading(true);
        const formData = new FormData();
        formData.append("file", selected);

        try {
            const res = await fetch(
                `/api/upload/technical-equipment/${encodeURIComponent(equipmentId)}/${kind}`,
                { method: "POST", body: formData },
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Falha no upload");
            }
            const data = await res.json();
            onChange({
                id: data.id ?? crypto.randomUUID(),
                filename: data.filename,
                url: data.url,
                type: data.type,
            });
            toast.success(`${label} enviado`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erro ao enviar arquivo");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    if (!equipmentId) {
        return (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                Salve o equipamento para enviar {label.toLowerCase()}.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-sm font-medium">
                        {label}
                        {required ? <span className="text-destructive ml-1">*</span> : null}
                    </p>
                    {description ? (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    ) : null}
                </div>
                <label>
                    <input
                        type="file"
                        className="hidden"
                        accept={accept}
                        onChange={handleUpload}
                        disabled={uploading}
                    />
                    <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                        <span>
                            {uploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4" />
                            )}
                            <span className="ml-2">{file ? "Substituir" : "Enviar"}</span>
                        </span>
                    </Button>
                </label>
            </div>

            {file ? (
                <div className="flex items-center justify-between rounded-md border bg-card p-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm truncate">{file.filename}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <Button type="button" variant="ghost" size="icon" asChild>
                            <a href={file.url} target="_blank" rel="noreferrer" download>
                                <Download className="h-4 w-4" />
                            </a>
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onChange(null)}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                    Nenhum arquivo anexado
                </div>
            )}
        </div>
    );
}
