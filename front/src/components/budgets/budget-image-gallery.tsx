"use client";

import type { BudgetImage } from "@/types/budget-types";
import { toAbsoluteImageUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";

export interface BudgetImageGalleryProps {
  images: BudgetImage[];
  onAdd: () => void;
  onEdit: (image: BudgetImage) => void;
  onDelete: (image: BudgetImage) => void;
  emptyMessage?: string;
  addButtonLabel?: string;
  /** Apenas visualização (sem adicionar/editar/excluir). */
  readOnly?: boolean;
}

export function BudgetImageGallery({
  images,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage = "Nenhuma foto. Clique em Adicionar Foto para começar.",
  addButtonLabel = "Adicionar Foto",
  readOnly = false,
}: BudgetImageGalleryProps) {
  const handleDeleteClick = (image: BudgetImage) => {
    if (confirm("Excluir esta foto e suas anotações?")) {
      onDelete(image);
    }
  };

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-muted rounded-lg bg-muted/5 min-h-[120px]">
        <ImageIcon className="w-10 h-10 text-muted-foreground mb-3 opacity-60" />
        <p className="text-sm text-muted-foreground text-center mb-4">{emptyMessage}</p>
        {!readOnly && (
          <Button onClick={onAdd} size="sm">
            <ImageIcon className="w-4 h-4 mr-2" />
            {addButtonLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((image) => (
          <div
            key={image.id}
            className="relative aspect-video bg-muted rounded-md overflow-hidden group border-2 border-primary/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded images without known dimensions */}
            <img
              src={(toAbsoluteImageUrl(image.url || image.composed_url) || image.url || image.composed_url) ?? ""}
              alt="Foto do ambiente"
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {!readOnly && (
              <div
                className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 cursor-pointer"
                onClick={() => onEdit(image)}
                aria-label="Editar foto"
              >
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(image);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(image);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <Button variant="outline" size="sm" onClick={onAdd}>
          <ImageIcon className="w-4 h-4 mr-2" />
          {addButtonLabel}
        </Button>
      )}
    </div>
  );
}
