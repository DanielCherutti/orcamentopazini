
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2 } from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";

interface ImageUploadProps {
    productId?: string;
    initialUrl?: string;
    onImageUploaded: (url: string) => void;
    onImageRemoved: () => void;
}

export function ImageUpload({ productId, initialUrl, onImageUploaded, onImageRemoved }: ImageUploadProps) {
    const [preview, setPreview] = useState<string | null>(initialUrl || null);
    const [isUploading, setIsUploading] = useState(false);

    // Sincronizar preview quando initialUrl muda (ex: ao reabrir edição ou trocar de produto)
    useEffect(() => {
        setPreview(initialUrl || null);
    }, [initialUrl]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        const uploadUrl = productId
            ? `/api/upload/product/${encodeURIComponent(productId)}/image`
            : "/api/upload/product/pending";

        try {
            const res = await fetch(uploadUrl, {
                method: "POST",
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Upload failed");
            }

            const data = await res.json();
            setPreview(data.url);
            onImageUploaded(data.url);
        } catch (error) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem");
            setPreview(null);
            onImageRemoved();
        } finally {
            setIsUploading(false);
        }
    };

    const handleRemove = async () => {
        if (!productId) {
            setPreview(null);
            onImageRemoved();
            return;
        }

        // Just clear preview and notify. Real deletion happens on Update or separate action if needed.
        // Usually we want to clear from server too?
        setPreview(null);
        onImageRemoved();
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <div className="relative w-80 h-80 border rounded-md overflow-hidden bg-muted flex items-center justify-center">
                {preview ? (
                    <Image
                        src={preview}
                        alt="Product Image"
                        fill
                        sizes="320px"
                        className="object-cover"
                        unoptimized
                    />
                ) : (
                    <span className="text-muted-foreground text-xs">Sem imagem</span>
                )}

                {isUploading && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                        <Loader2 className="animate-spin" />
                    </div>
                )}
            </div>

            <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" type="button">
                    <label className="cursor-pointer">
                        <Upload className="mr-2 h-4 w-4" />
                        {preview ? "Trocar" : "Carregar"}
                        <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={handleFileChange}
                            name="imageFile" // Name for Form submission
                        />
                    </label>
                </Button>

                {preview && (
                    <Button variant="destructive" size="sm" onClick={handleRemove} type="button">
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
