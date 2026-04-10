"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import Link from "next/link";
import {
  ImageIcon,
  LayoutTemplate,
  Loader2,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateBlockAction } from "@/actions/budget-compositor-block-actions";
import { getBudgetShellAction } from "@/actions/budget-actions";
import { getCustomerAction } from "@/actions/client-actions";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import type { Budget } from "@/types/budget-types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { mergeCoverDocumentProps } from "@/lib/budgets/cover-document";
import { CompositorRichTextEditor } from "@/components/budgets/compositor/compositor-rich-text-editor";
import { DEFAULT_CLIENT_LOGO_LAYOUT } from "@/lib/budgets/cover-client-logo-layout";
import { CompositorCoverPdfBandsDialog } from "@/components/budgets/compositor/compositor-cover-pdf-bands-dialog";

export function CompositorCoverBlock({
  block,
  budgetId,
  isReadOnly,
}: {
  block: BudgetBlock;
  budgetId: string;
  isReadOnly?: boolean;
}) {
  const [props, setProps] = useState<CoverBlockProps>(() =>
    mergeCoverDocumentProps(block.props as Record<string, unknown>)
  );
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [coverSettingsOpen, setCoverSettingsOpen] = useState(false);
  const [coverPdfBandsOpen, setCoverPdfBandsOpen] = useState(false);
  const [coverExpanded, setCoverExpanded] = useState(false);
  const [coverMediaUploading, setCoverMediaUploading] = useState<
    null | "client_logo_url" | "cover_watermark_url" | "document_watermark_url"
  >(null);
  const clientLogoFileRef = useRef<HTMLInputElement>(null);
  const coverWatermarkFileRef = useRef<HTMLInputElement>(null);
  const documentWatermarkFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setProps(mergeCoverDocumentProps(block.props as Record<string, unknown>));
  }, [block.props]);

  useEffect(() => {
    if (!coverExpanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [coverExpanded]);

  useEffect(() => {
    if (!coverExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCoverExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coverExpanded]);

  useEffect(() => {
    let cancelled = false;
    getBudgetShellAction(budgetId).then((bRes) => {
      if (cancelled) return;
      if (bRes.success && bRes.data) setBudget(bRes.data as Budget);
    });
    return () => {
      cancelled = true;
    };
  }, [budgetId]);

  const persist = useDebouncedCallback(async (next: CoverBlockProps) => {
    if (isReadOnly) return;
    const res = await updateBlockAction(block.id, budgetId, { props: next as Record<string, unknown> });
    if (!res.success) {
      toast.error(res.error || "Erro ao salvar capa");
    }
  }, 500);

  const patch = useCallback(
    (partial: Partial<CoverBlockProps>) => {
      setProps((prev) => {
        const next: CoverBlockProps = { ...prev, ...partial };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const uploadCoverMediaField = useCallback(
    async (
      field: "client_logo_url" | "cover_watermark_url" | "document_watermark_url",
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || isReadOnly) return;
      setCoverMediaUploading(field);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/library", { method: "POST", body: fd });
        const json = (await res.json()) as { url?: string; error?: string };
        if (!res.ok || !json.url) {
          toast.error(json.error || "Falha ao enviar a imagem");
          return;
        }
        patch({ [field]: json.url });
        toast.success("Imagem enviada e aplicada.");
      } catch {
        toast.error("Erro ao enviar a imagem");
      } finally {
        setCoverMediaUploading(null);
      }
    },
    [isReadOnly, patch]
  );

  const fillFromCustomer = async () => {
    if (!budget?.client_id || isReadOnly) return;
    const cid =
      typeof budget.client_id === "object" && budget.client_id !== null && "id" in budget.client_id
        ? String((budget.client_id as { id: string }).id)
        : String(budget.client_id).trim();
    if (!cid) {
      toast.error("Selecione um cliente no orçamento antes de preencher.");
      return;
    }
    setLoadingClient(true);
    try {
      const res = await getCustomerAction(cid);
      if (!res.success || !res.data) {
        toast.error(res.error || "Não foi possível carregar o cliente.");
        return;
      }
      const c = res.data;
      const addr = c.address;
      const streetParts = [addr?.street, addr?.number, addr?.complement].filter(Boolean).join(", ");
      const municipality = [addr?.city || c.city, addr?.state].filter(Boolean).join(" - ");
      patch({
        client_legal_name: c.name || "",
        client_trade_name: c.name || "",
        client_cnpj: c.cnpj || "",
        client_municipality: municipality,
        client_address: streetParts || "",
        client_cep: addr?.cep || "",
      });
      toast.success("Dados cadastrais preenchidos a partir do cliente.");
    } finally {
      setLoadingClient(false);
    }
  };

  const mediaPanel = (
    <div className="space-y-4 p-1">
      <p className="text-[11px] leading-snug text-muted-foreground">
        Informe uma URL pública ou envie uma imagem (JPG, PNG, GIF ou WEBP). No texto da capa, use o editor para inserir imagens no corpo do documento.
      </p>
      <div className="space-y-2">
        <Label htmlFor={`cover-clogo-${block.id}`} className="text-xs">
          Logomarca do cliente
        </Label>
        <p className="text-[10px] leading-snug text-muted-foreground">
          Na folha da capa, arraste a logo para posicionar e use o quadrado no canto inferior direito para redimensionar.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id={`cover-clogo-${block.id}`}
            placeholder="URL ou envie um arquivo ao lado"
            value={props.client_logo_url ?? ""}
            onChange={(e) => patch({ client_logo_url: e.target.value })}
            disabled={isReadOnly}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <input
            ref={clientLogoFileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => uploadCoverMediaField("client_logo_url", e)}
            disabled={isReadOnly}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            disabled={isReadOnly || coverMediaUploading === "client_logo_url"}
            onClick={() => clientLogoFileRef.current?.click()}
          >
            {coverMediaUploading === "client_logo_url" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Enviar imagem
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`cover-wm1-${block.id}`} className="text-xs">
          Marca d’água da capa
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id={`cover-wm1-${block.id}`}
            placeholder="URL ou envie um arquivo ao lado"
            value={props.cover_watermark_url ?? ""}
            onChange={(e) => patch({ cover_watermark_url: e.target.value })}
            disabled={isReadOnly}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <input
            ref={coverWatermarkFileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => uploadCoverMediaField("cover_watermark_url", e)}
            disabled={isReadOnly}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            disabled={isReadOnly || coverMediaUploading === "cover_watermark_url"}
            onClick={() => coverWatermarkFileRef.current?.click()}
          >
            {coverMediaUploading === "cover_watermark_url" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Enviar imagem
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Opacidade na capa</Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="w-full accent-foreground"
          value={props.cover_watermark_opacity ?? 0.12}
          onChange={(e) => patch({ cover_watermark_opacity: Number(e.target.value) })}
          disabled={isReadOnly}
        />
      </div>
      <Separator />
      <div className="space-y-2">
        <Label htmlFor={`cover-wm2-${block.id}`} className="text-xs">
          Marca d’água do documento (demais páginas)
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            id={`cover-wm2-${block.id}`}
            placeholder="URL ou envie um arquivo ao lado"
            value={props.document_watermark_url ?? ""}
            onChange={(e) => patch({ document_watermark_url: e.target.value })}
            disabled={isReadOnly}
            className="h-8 min-w-0 flex-1 text-xs"
          />
          <input
            ref={documentWatermarkFileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="sr-only"
            onChange={(e) => uploadCoverMediaField("document_watermark_url", e)}
            disabled={isReadOnly}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 text-xs"
            disabled={isReadOnly || coverMediaUploading === "document_watermark_url"}
            onClick={() => documentWatermarkFileRef.current?.click()}
          >
            {coverMediaUploading === "document_watermark_url" ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Enviando…
              </>
            ) : (
              <>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Enviar imagem
              </>
            )}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Opacidade no documento</Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          className="w-full accent-foreground"
          value={props.document_watermark_opacity ?? 0.06}
          onChange={(e) => patch({ document_watermark_opacity: Number(e.target.value) })}
          disabled={isReadOnly}
        />
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden",
        coverExpanded
          ? "fixed inset-0 z-40 m-0 flex h-[100dvh] max-h-none min-h-0 w-screen rounded-none border-0 bg-neutral-200/95 shadow-none dark:bg-neutral-950"
          : "max-h-[min(92vh,960px)] min-h-[min(72vh,560px)] rounded-lg border border-neutral-300/90 bg-neutral-200/50 shadow-sm dark:border-neutral-700 dark:bg-neutral-950/40",
      )}
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-neutral-300/90 bg-gradient-to-b from-neutral-50 to-neutral-200/95 px-3 py-2 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-950">
        <div className="flex items-center gap-2 border-r border-neutral-300 pr-3 dark:border-neutral-600">
          <Sparkles className="h-4 w-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Capa</h2>
            <p className="hidden text-[10px] text-neutral-500 sm:block dark:text-neutral-400">
              {coverExpanded
                ? "Modo expandido — Esc para sair"
                : "Edite o texto na folha como em um documento; mídia e marcas d’água em Ajustes da capa"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!isReadOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
              onClick={fillFromCustomer}
              disabled={loadingClient}
            >
              <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loadingClient && "animate-spin")} />
              Preencher cliente
            </Button>
          )}
          <Button
            type="button"
            variant={coverExpanded ? "secondary" : "outline"}
            size="sm"
            className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            onClick={() => setCoverExpanded((v) => !v)}
            title={coverExpanded ? "Sair da edição em tela cheia (Esc)" : "Expandir capa para editar em tela cheia"}
          >
            {coverExpanded ? (
              <>
                <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
                Sair da expansão
              </>
            ) : (
              <>
                <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                Expandir capa
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            onClick={() => setCoverSettingsOpen(true)}
          >
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            Ajustes da capa
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            onClick={() => setCoverPdfBandsOpen(true)}
            title="Cabeçalho e rodapé fixos da capa no PDF"
          >
            <LayoutTemplate className="mr-1.5 h-3.5 w-3.5" />
            Cabeçalho / rodapé (PDF)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            asChild
          >
            <Link href="/settings">
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              Empresa
            </Link>
          </Button>
        </div>
        {budget?.code ? (
          <span className="ml-auto hidden font-mono text-[10px] text-neutral-500 sm:inline dark:text-neutral-400">
            {budget.code}
          </span>
        ) : null}
      </header>

      <CompositorCoverPdfBandsDialog
        open={coverPdfBandsOpen}
        onOpenChange={setCoverPdfBandsOpen}
        coverProps={props}
        patch={patch}
        budget={budget}
        isReadOnly={isReadOnly}
      />

      <Dialog open={coverSettingsOpen} onOpenChange={setCoverSettingsOpen}>
        <DialogContent
          className="flex min-h-0 max-h-[min(92vh,640px)] w-full max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-12 text-left">
            <DialogTitle className="text-base">Ajustes da capa</DialogTitle>
            <p className="text-xs font-normal text-muted-foreground">
              Marca d’água, logomarca do cliente e mídia (URL ou arquivo).
            </p>
          </DialogHeader>
          <ScrollArea className="h-[min(60vh,520px)] w-full min-h-0 shrink">
            <div className="p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ImageIcon className="h-3.5 w-3.5 opacity-70" />
                Mídia
              </div>
              {mediaPanel}
            </div>
          </ScrollArea>
          <div className="shrink-0 border-t border-border px-4 py-2.5 text-[10px] leading-snug text-muted-foreground">
            O código do orçamento e a data na proposta vêm dos <strong className="font-medium text-foreground">dados da proposta</strong>.
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-neutral-950">
        <CompositorRichTextEditor
          variant="word"
          readOnly={Boolean(isReadOnly)}
          value={props.cover_document_html ?? ""}
          onChange={(html) => patch({ cover_document_html: html })}
          wordPageWatermarkUrl={props.cover_watermark_url?.trim() || undefined}
          wordPageWatermarkOpacity={props.cover_watermark_opacity ?? 0.12}
          wordPageClientLogo={
            props.client_logo_url?.trim()
              ? {
                  url: props.client_logo_url.trim(),
                  readOnly: Boolean(isReadOnly),
                  xPct: props.client_logo_x_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.xPct,
                  yPct: props.client_logo_y_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.yPct,
                  widthPct: props.client_logo_width_pct ?? DEFAULT_CLIENT_LOGO_LAYOUT.widthPct,
                  aspect: props.client_logo_aspect,
                  onLayoutChange: (l) =>
                    patch({
                      client_logo_x_pct: l.xPct,
                      client_logo_y_pct: l.yPct,
                      client_logo_width_pct: l.widthPct,
                    }),
                  onAspectChange: (aspect) => patch({ client_logo_aspect: aspect }),
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
