"use client";

import { useState, memo } from "react";
import { Image as ImageIcon, Package, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/lib/toast";
import { getProductsAction } from "@/actions/product-actions";
import type { Product } from "@/actions/product-actions";
import type { BudgetImage } from "@/types/budget-types";

// Inline mini product search (sem usar ProductSelector que tem seu próprio Popover interno)
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedCallback } from "use-debounce";
import { sanitizeRichHtmlForStorage } from "@/lib/pdf/sanitize-inline-styles-for-pdf";

// ─── CollapsibleEditorSection ─────────────────────────────────────────────────

export function CollapsibleEditorSection({
  label,
  children,
  defaultOpen = true,
  rightContent,
  open: openProp,
  onOpenChange,
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  rightContent?: React.ReactNode;
  /** Modo controlado (opcional). Se informado, `defaultOpen` é ignorado após o primeiro render. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-1 group text-left"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
              open && "rotate-90"
            )}
          />
          <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
            {label}
          </span>
        </button>
        {rightContent && (
          <span className="text-xs font-semibold text-foreground">{rightContent}</span>
        )}
      </div>
      {open && children}
    </div>
  );
}

// ─── CompositorRichTextEditor ─────────────────────────────────────────────────

interface CompositorRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  galleryImages?: BudgetImage[];
  variant?: "default" | "word";
  readOnly?: boolean;
  /** Pré-visualização na folha A4 (capa): marca d’água e logomarca do cliente. */
  wordPageWatermarkUrl?: string;
  wordPageWatermarkOpacity?: number;
  wordPageWatermarkScalePct?: number;
  wordPageWatermarkLayout?: {
    readOnly: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    aspect?: number;
    onLayoutChange: (layout: { xPct: number; yPct: number; widthPct: number }) => void;
    onAspectChange: (aspect: number) => void;
  };
  wordPageClientLogo?: {
    url: string;
    readOnly: boolean;
    xPct: number;
    yPct: number;
    widthPct: number;
    aspect?: number;
    onLayoutChange: (layout: { xPct: number; yPct: number; widthPct: number }) => void;
    onAspectChange: (aspect: number) => void;
  };
  wordPageBands?: {
    headerHeight: number;
    footerHeight: number;
    activeBand?: "header" | "footer";
    onSelectBand?: (band: "header" | "footer") => void;
    onApplyTemplate?: (payload: { band: "header" | "footer"; template: "blank" | "blank_three_columns" }) => void;
    onHeaderHeightChange?: (height: number) => void;
    onFooterHeightChange?: (height: number) => void;
  };
}

export const CompositorRichTextEditor = memo(function CompositorRichTextEditor({
  value,
  onChange,
  placeholder,
  galleryImages,
  variant = "default",
  readOnly,
  wordPageWatermarkUrl,
  wordPageWatermarkOpacity,
  wordPageWatermarkScalePct,
  wordPageWatermarkLayout,
  wordPageClientLogo,
  wordPageBands,
}: CompositorRichTextEditorProps) {
  const [insertImage, setInsertImage] = useState<((url: string) => void) | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const handleProductSearch = useDebouncedCallback(async (term: string) => {
    setLoadingProducts(true);
    const result = await getProductsAction({ query: term, limit: 20 });
    if (result?.data) setProducts(result.data);
    setLoadingProducts(false);
  }, 300);

  const handleProductOpen = (open: boolean) => {
    setProductOpen(open);
    if (open && products.length === 0) handleProductSearch("");
  };

  const handleSelectProduct = (product: Product) => {
    if (!product.imageUrl) {
      toast.error("Este produto não possui imagem.");
      return;
    }
    insertImage?.(product.imageUrl);
    setProductOpen(false);
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/budget/image", { method: "POST", body: fd });
    const json = await res.json() as { url?: string; error?: string };
    if (!res.ok || !json.url) throw new Error(json.error || "Upload falhou");
    return json.url;
  };

  const extraToolbarItems = (
    <div className="flex items-center gap-1.5">
      {galleryImages && galleryImages.length > 0 && (
        <Popover open={galleryOpen} onOpenChange={setGalleryOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              title="Inserir da galeria"
              className="h-7 w-7 shrink-0 p-0"
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-72 p-2"
            align="start"
            side="bottom"
            sideOffset={6}
            collisionPadding={16}
          >
            <p className="mb-2 text-xs font-medium text-muted-foreground">Galeria do bloco</p>
            <div className="grid grid-cols-3 gap-2">
              {galleryImages.map((img) => (
                <button
                  key={img.id}
                  type="button"
                  className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted/30 hover:ring-2 hover:ring-primary"
                  onClick={() => {
                    insertImage?.(img.composed_url || img.url);
                    setGalleryOpen(false);
                  }}
                >
                  <img
                    src={img.composed_url || img.url}
                    className="absolute inset-0 h-full w-full object-cover"
                    alt=""
                  />
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <Popover open={productOpen} onOpenChange={handleProductOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            title="Inserir imagem de produto"
            className="h-7 w-7 shrink-0 p-0"
          >
            <Package className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-80 p-0"
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={16}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar produto..."
              onValueChange={handleProductSearch}
            />
            <CommandList>
              {loadingProducts && (
                <div className="py-4 text-center text-sm text-muted-foreground">Buscando...</div>
              )}
              {!loadingProducts && products.length === 0 && (
                <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
              )}
              {!loadingProducts && (
                <CommandGroup>
                  {products.map((product) => (
                    <CommandItem
                      key={product.id}
                      value={product.id ?? ""}
                      onSelect={() => handleSelectProduct(product)}
                      className="flex items-center gap-2"
                    >
                      <Package className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate text-sm">{product.description}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <RichTextEditor
      value={value}
      onChange={(html) => onChange(sanitizeRichHtmlForStorage(html))}
      placeholder={placeholder}
      variant={variant}
      readOnly={readOnly}
      onUploadImage={handleUploadImage}
      extraToolbarItems={extraToolbarItems}
      onEditorReady={(fn) => setInsertImage(() => fn)}
      wordPageWatermarkUrl={wordPageWatermarkUrl}
      wordPageWatermarkOpacity={wordPageWatermarkOpacity}
      wordPageWatermarkScalePct={wordPageWatermarkScalePct}
      wordPageWatermarkLayout={wordPageWatermarkLayout}
      wordPageClientLogo={wordPageClientLogo}
      wordPageBands={wordPageBands}
    />
  );
});
