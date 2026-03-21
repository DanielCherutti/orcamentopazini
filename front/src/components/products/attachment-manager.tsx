
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileIcon, X, Loader2, Download } from "lucide-react";

export type Attachment = {
    id: string; // usually filename or path
    filename: string;
    url: string;
    type: string;
};

interface AttachmentManagerProps {
    productId?: string;
    attachments: Attachment[];
    onAttachmentsChange: (attachments: Attachment[]) => void;
}

export function AttachmentManager({ productId, attachments, onAttachmentsChange }: AttachmentManagerProps) {
    const [isUploading, setIsUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !productId) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`/api/upload/product/${encodeURIComponent(productId)}/attachments`, {
                method: "POST",
                body: formData
            });

            if (!res.ok) throw new Error("Upload failed");

            const data = await res.json();
            // Server returns { filename, url, type }
            // We need an ID. Let's use url or generate one. 
            // The API doesn't return ID currently, just URL. 
            // Product schema expects Attachment[].
            const newAttachment: Attachment = {
                id: crypto.randomUUID(),
                filename: data.filename,
                url: data.url,
                type: data.type
            };

            onAttachmentsChange([...attachments, newAttachment]);
        } catch (error) {
            console.error(error);
            alert("Erro ao enviar anexo");
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = (id: string) => {
        // Just remove from list. Deletion from disk could optionally happen here via API or on Save.
        // For simplicity, we just update the list.
        onAttachmentsChange(attachments.filter(a => a.id !== id));
    };

    if (!productId) {
        return (
            <div className="p-8 text-center bg-muted rounded-md border border-dashed">
                <p className="text-muted-foreground">Salve o produto para gerenciar anexos.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-2">
                {attachments.map((file) => (
                    <div key={file.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                        <div className="flex items-center gap-3">
                            <FileIcon className="h-5 w-5 text-primary" />
                            <div>
                                <p className="text-sm font-medium">{file.filename}</p>
                                <p className="text-xs text-muted-foreground">{file.type}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" asChild>
                                <a href={file.url} target="_blank" rel="noopener noreferrer" download>
                                    <Download className="h-4 w-4" />
                                </a>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleRemove(file.id)} className="text-destructive">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                ))}

                {attachments.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum anexo adicionado.</p>
                )}
            </div>

            <div className="flex justify-end">
                <Button asChild disabled={isUploading}>
                    <label className="cursor-pointer">
                        {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Adicionar Anexo
                        <input
                            type="file"
                            className="hidden"
                            onChange={handleUpload}
                        />
                    </label>
                </Button>
            </div>
        </div>
    );
}
