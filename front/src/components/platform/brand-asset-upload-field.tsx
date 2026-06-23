"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { Loader2, Upload, X } from "lucide-react";

type Props = {
    id: string;
    label: string;
    hint?: string;
    value: string;
    onChange: (url: string) => void;
    disabled?: boolean;
    asset?: "logo" | "favicon";
    uploadUrl: string;
    uploadExtraFields?: Record<string, string>;
    previewSize?: number;
};

export function BrandAssetUploadField({
    id,
    label,
    hint,
    value,
    onChange,
    disabled,
    asset = "logo",
    uploadUrl,
    uploadExtraFields,
    previewSize = asset === "favicon" ? 40 : 56,
}: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

    const accept =
        asset === "favicon"
            ? "image/png,image/x-icon,image/vnd.microsoft.icon,image/jpeg,image/gif,image/webp,.ico"
            : "image/jpeg,image/png,image/gif,image/webp";

    async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            fd.append("asset", asset);
            if (uploadExtraFields) {
                for (const [k, v] of Object.entries(uploadExtraFields)) {
                    fd.append(k, v);
                }
            }
            const res = await fetch(uploadUrl, { method: "POST", body: fd });
            const json = (await res.json()) as { url?: string; error?: string };
            if (!res.ok || !json.url) {
                toast.error(json.error || "Falha ao enviar a imagem");
                return;
            }
            onChange(json.url);
            toast.success(
                asset === "favicon"
                    ? "Favicon enviado. Salve para aplicar."
                    : "Logo enviado. Salve para aplicar.",
            );
        } catch {
            toast.error("Erro ao enviar a imagem");
        } finally {
            setUploading(false);
        }
    }

    const busy = disabled || uploading;

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                {value.trim() && (
                    <div
                        className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-2"
                        style={{ width: previewSize + 16, height: previewSize + 16 }}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={value}
                            alt=""
                            className="max-h-full max-w-full object-contain"
                            style={{ maxHeight: previewSize, maxWidth: previewSize }}
                        />
                    </div>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                            id={id}
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            placeholder="https://… ou envie um arquivo"
                            disabled={busy}
                            className="h-10 sm:flex-1"
                        />
                        <input
                            ref={inputRef}
                            type="file"
                            accept={accept}
                            className="sr-only"
                            onChange={handleFileSelected}
                        />
                        <Button
                            type="button"
                            variant="outline"
                            className="shrink-0 gap-2"
                            disabled={busy}
                            onClick={() => inputRef.current?.click()}
                        >
                            {uploading ? (
                                <Loader2 className="size-4 animate-spin" />
                            ) : (
                                <Upload className="size-4" />
                            )}
                            Enviar
                        </Button>
                        {value && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="shrink-0"
                                disabled={busy}
                                onClick={() => onChange("")}
                                aria-label="Remover"
                            >
                                <X className="size-4" />
                            </Button>
                        )}
                    </div>
                    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
                </div>
            </div>
        </div>
    );
}
