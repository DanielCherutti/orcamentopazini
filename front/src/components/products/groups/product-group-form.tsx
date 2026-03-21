"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, X, Layers } from "lucide-react";
import Image from "next/image";

interface ProductGroupFormProps {
  initialName?: string;
  initialImageUrl?: string;
  onSubmit: (formData: FormData) => Promise<void>;
  isSubmitting?: boolean;
  submitLabel?: string;
  generalError?: string;
}

export function ProductGroupForm({
  initialName = "",
  initialImageUrl,
  onSubmit,
  isSubmitting = false,
  submitLabel = "Salvar",
  generalError,
}: ProductGroupFormProps) {
  const [name, setName] = useState(initialName);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImageUrl ?? null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setRemoveImage(false);
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setRemoveImage(true);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append("name", name);
    if (imageFile) {
      fd.append("image", imageFile);
    }
    if (removeImage) {
      fd.append("removeImage", "true");
    }
    await onSubmit(fd);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {generalError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {generalError}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Nome do grupo *</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Kit Guarda-Corpo"
          required
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <Label>Imagem do grupo</Label>
        <div className="flex items-start gap-4">
          <div className="relative w-24 h-24 rounded-md overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0">
            {imagePreview ? (
              <Image
                src={imagePreview}
                alt="Preview"
                fill
                sizes="96px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <Layers className="h-8 w-8 text-muted-foreground/30" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSubmitting}
            >
              <Upload className="h-4 w-4 mr-2" />
              {imagePreview ? "Trocar imagem" : "Carregar imagem"}
            </Button>
            {imagePreview && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRemoveImage}
                disabled={isSubmitting}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Remover imagem
              </Button>
            )}
            <p className="text-xs text-muted-foreground">JPG, PNG ou WebP — máx. 2MB</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting || !name.trim()}>
          {isSubmitting ? "Salvando..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}
