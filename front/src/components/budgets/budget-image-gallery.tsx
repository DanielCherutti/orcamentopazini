"use client";

import type { BudgetImage } from "@/types/budget-types";
import { cn, toAbsoluteImageUrl } from "@/lib/utils";
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
  /** id da imagem → número da figura (lista do documento). */
  figureNumbersByImageId?: Record<string, number>;
}

export function BudgetImageGallery({
  images,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage = "Nenhuma foto. Clique em Adicionar Foto para começar.",
  addButtonLabel = "Adicionar Foto",
  readOnly = false,
  figureNumbersByImageId,
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((image) => {
          /* Versão composta primeiro: inclui figurinhas, setas e demais anotações “queimadas” no editor. */
          const rawDisplay = image.composed_url || image.url;
          const displaySrc =
            (toAbsoluteImageUrl(rawDisplay) || rawDisplay) ?? "";
          const nw = Number(image.width);
          const nh = Number(image.height);
          const w = Number.isFinite(nw) && nw > 0 ? Math.round(nw) : undefined;
          const h = Number.isFinite(nh) && nh > 0 ? Math.round(nh) : undefined;

          const figN = figureNumbersByImageId?.[image.id];
          const cap = (image.caption ?? "").trim();

          return (
          <div
            key={image.id}
            className="group relative flex w-full flex-col gap-1.5 rounded-md border-2 border-primary/50 bg-muted/40 p-1.5 shadow-sm"
          >
            <div className="relative flex max-h-[min(240px,42vh)] w-full items-center justify-center overflow-hidden rounded-md bg-muted sm:max-h-[min(280px,38vh)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded images without known dimensions */}
            <img
              src={displaySrc}
              alt={cap || "Foto do escopo (com anotações, se houver)"}
              width={w}
              height={h}
              className="h-auto max-h-[min(240px,42vh)] w-auto max-w-full object-contain sm:max-h-[min(280px,38vh)]"
              loading="lazy"
              decoding="async"
            />
            {!readOnly && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-colors group-hover:pointer-events-auto group-hover:bg-black/35 group-hover:opacity-100">
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-9 w-9 shadow-md"
                  onClick={() => onEdit(image)}
                  aria-label="Editar foto"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-9 w-9 shadow-md"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteClick(image);
                  }}
                  aria-label="Excluir foto"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
            </div>
            <div className="space-y-0.5 px-0.5">
              {figN != null ? (
                <p className="text-center text-sm font-semibold text-foreground sm:text-left">
                  Figura {figN}
                </p>
              ) : null}
              <p
                className={cn(
                  "text-center text-sm leading-snug sm:text-left",
                  cap ? "text-foreground" : "italic text-muted-foreground",
                )}
              >
                {cap || "Sem legenda — use Editar para preencher a descrição da figura."}
              </p>
              {w != null && h != null ? (
                <p className="text-center text-[11px] text-muted-foreground tabular-nums sm:text-left">
                  {w} × {h}px
                  {image.composed_url ? " · com anotações" : ""}
                </p>
              ) : null}
            </div>
          </div>
          );
        })}
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
