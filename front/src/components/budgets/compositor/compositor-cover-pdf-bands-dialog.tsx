"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { getProposalSettingsAction } from "@/actions/settings-actions";
import type { ProposalSettings } from "@/actions/settings-actions";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import type { Budget } from "@/types/budget-types";
import {
  buildCoverPdfBandContext,
  formatCoverPdfFooterLeftText,
  formatCoverPdfFooterRightText,
  resolveCoverPdfHeaderCompanyText,
  resolveCoverPdfHeaderLogoUrl,
  shouldShowCoverPdfHeaderBand,
} from "@/lib/pdf/cover-pdf-band-resolve";
import { buildPdfContactLines } from "@/lib/pdf/pdf-proposal-header";
import {
  clampCoverFooterBandPt,
  clampCoverHeaderBandPt,
  COVER_FOOTER_BAND_PT_MAX,
  COVER_FOOTER_BAND_PT_MIN,
  COVER_HEADER_BAND_PT_MAX,
  COVER_HEADER_BAND_PT_MIN,
  DEFAULT_COVER_FOOTER_BAND_PT,
  DEFAULT_COVER_HEADER_BAND_PT,
  PDF_COVER_PAGE_H_PT,
} from "@/lib/pdf/cover-pdf-band-layout";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

const PREVIEW_W = 300;
const PREVIEW_H = (PREVIEW_W * 297) / 210;

/**
 * Arraste com listeners em `window` (capture + non-passive): dentro do Dialog do Radix,
 * `setPointerCapture` / `mousemove` no elemento nem sempre entregam todos os eventos.
 */
function startBandDragWindow(
  e: React.PointerEvent<HTMLDivElement>,
  onMove: (clientY: number) => void,
  onEnd: () => void,
) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();

  const pid = e.pointerId;
  let ended = false;

  const move = (ev: PointerEvent) => {
    if (ended) return;
    if (ev.pointerId !== pid) return;
    ev.preventDefault();
    onMove(ev.clientY);
  };

  const end = (ev: PointerEvent) => {
    if (ended) return;
    if (ev.pointerId !== pid) return;
    ended = true;
    ev.preventDefault();
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", end, true);
    window.removeEventListener("pointercancel", end, true);
    onEnd();
  };

  window.addEventListener("pointermove", move, { capture: true, passive: false });
  window.addEventListener("pointerup", end, { capture: true, passive: false });
  window.addEventListener("pointercancel", end, { capture: true, passive: false });
}

function CoverPdfBandInteractivePreview({
  coverProps,
  settings,
  budget,
  patch,
  isReadOnly,
}: {
  coverProps: CoverBlockProps;
  settings: ProposalSettings | null;
  budget: Budget | null;
  patch: (partial: Partial<CoverBlockProps>) => void;
  isReadOnly: boolean;
}) {
  const pxPerPt = PREVIEW_H / PDF_COVER_PAGE_H_PT;
  const patchRef = useRef(patch);
  patchRef.current = patch;

  const ctx = budget
    ? buildCoverPdfBandContext(budget)
    : {
        dateLabel: "9 abr. 2026",
        code: "ORC-000",
        title: "Título do orçamento",
      };
  const fill = settings?.pdf_header_fill_from_settings === true;
  const company = resolveCoverPdfHeaderCompanyText(
    coverProps,
    fill ? settings?.company_name : undefined,
  );
  const logoUrl = resolveCoverPdfHeaderLogoUrl(
    coverProps,
    fill ? settings?.company_logo_url : undefined,
  );
  /** Checkboxes da capa — o que controla se a faixa existe no PDF (espaço reservado). */
  const headerBandOn = coverProps.cover_pdf_show_header_band !== false;
  const footerBandOn = coverProps.cover_pdf_show_footer_band !== false;
  /** Conteúdo rico no cabeçalho (logo/nome) — pode estar off mesmo com a faixa ligada. */
  const headerContentVisible = shouldShowCoverPdfHeaderBand(coverProps, settings ?? undefined);
  const left = formatCoverPdfFooterLeftText(coverProps, ctx);
  const right = formatCoverPdfFooterRightText(coverProps, ctx);
  const subtitle = fill ? settings?.company_header_subtitle?.trim() || "" : "";
  const contactLines = fill && settings ? buildPdfContactLines(settings) : [];

  const headerPt = clampCoverHeaderBandPt(
    coverProps.cover_pdf_header_band_height_pt,
    DEFAULT_COVER_HEADER_BAND_PT,
  );
  const footerPt = clampCoverFooterBandPt(
    coverProps.cover_pdf_footer_band_height_pt,
    DEFAULT_COVER_FOOTER_BAND_PT,
  );
  const headerPx = headerPt * pxPerPt;
  const footerPx = footerPt * pxPerPt;
  const headerBoxPx = Math.max(28, headerPx);
  const footerBoxPx = Math.max(24, footerPx);

  const onHeaderHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isReadOnly || !headerBandOn) return;
      const startY = e.clientY;
      const startPt = headerPt;
      startBandDragWindow(
        e,
        (clientY) => {
          const next = clampCoverHeaderBandPt(
            startPt + (clientY - startY) / pxPerPt,
            DEFAULT_COVER_HEADER_BAND_PT,
          );
          patchRef.current({ cover_pdf_header_band_height_pt: next });
        },
        () => {},
      );
    },
    [isReadOnly, headerBandOn, headerPt, pxPerPt],
  );

  const onFooterHandlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isReadOnly || !footerBandOn) return;
      const startY = e.clientY;
      const startPt = footerPt;
      startBandDragWindow(
        e,
        (clientY) => {
          const next = clampCoverFooterBandPt(
            startPt - (clientY - startY) / pxPerPt,
            DEFAULT_COVER_FOOTER_BAND_PT,
          );
          patchRef.current({ cover_pdf_footer_band_height_pt: next });
        },
        () => {},
      );
    },
    [isReadOnly, footerBandOn, footerPt, pxPerPt],
  );

  const handleBar =
    "pointer-events-auto absolute left-0 right-0 z-[200] flex min-h-[28px] cursor-ns-resize touch-none select-none items-center justify-center border-y-2 border-dashed border-primary bg-primary/20 py-2 shadow-sm hover:bg-primary/30";

  return (
    <div className="space-y-2">
      <div
        className="relative mx-auto rounded border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-neutral-950"
        style={{ width: PREVIEW_W, height: PREVIEW_H, touchAction: "none" }}
      >
        {/* Camada só visual — não rouba clique das alças por cima */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded">
          {headerBandOn ? (
            <div
              className="absolute left-0 right-0 top-0 z-10 overflow-hidden border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-700"
              style={{ height: headerBoxPx }}
            >
              {headerContentVisible ? (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-start gap-1.5">
                    {logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- preview leve; URL pública
                      <img
                        src={logoUrl}
                        alt=""
                        className="h-7 w-14 shrink-0 object-contain"
                        onError={(ev) => {
                          (ev.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    ) : null}
                    <div className="min-w-0">
                      {company ? (
                        <p className="text-[8px] font-bold uppercase leading-tight text-primary">{company}</p>
                      ) : (
                        <p className="text-[7px] italic text-muted-foreground">Nome em Configurações</p>
                      )}
                      {subtitle ? (
                        <p className="mt-0.5 text-[6px] uppercase tracking-[0.18em] text-primary">{subtitle}</p>
                      ) : null}
                    </div>
                  </div>
                  {contactLines.length > 0 ? (
                    <div className="max-w-[48%] shrink-0 text-right">
                      {contactLines.map((line, i) => (
                        <p key={i} className="text-[5.5px] leading-snug text-primary">
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center px-2">
                  <p className="text-center text-[6px] leading-snug text-muted-foreground">
                    Faixa reservada no PDF. Ative &quot;Usar estes dados no cabeçalho&quot; em Configurações ou use
                    nome/logo acima.
                  </p>
                </div>
              )}
            </div>
          ) : null}
          <div
            className="absolute left-2 right-2 text-[7px] leading-snug text-muted-foreground"
            style={{
              top: headerBandOn ? headerBoxPx + 10 : 10,
              bottom: footerBandOn ? footerBoxPx + 10 : 10,
            }}
          >
            <p className="text-center">Conteúdo da capa (editor)</p>
          </div>
          {footerBandOn ? (
            <div
              className="absolute bottom-0 left-0 right-0 z-10 flex items-start justify-between gap-1 overflow-hidden border-t border-neutral-200 px-2 py-1 dark:border-neutral-700"
              style={{ height: footerBoxPx }}
            >
              <span className="line-clamp-2 min-w-0 flex-1 text-[7px] text-muted-foreground">{left}</span>
              <span className="line-clamp-2 max-w-[45%] shrink-0 text-right text-[7px] text-muted-foreground">
                {right}
              </span>
            </div>
          ) : null}
        </div>
        {headerBandOn && !isReadOnly ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Redimensionar cabeçalho da capa — arraste ou use o controle à esquerda"
            className={cn(handleBar)}
            style={{ top: headerBoxPx - 8 }}
            onPointerDownCapture={onHeaderHandlePointerDown}
          />
        ) : null}
        {footerBandOn && !isReadOnly ? (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Redimensionar rodapé da capa — arraste ou use o controle à esquerda"
            className={cn(handleBar)}
            style={{ bottom: footerBoxPx - 8 }}
            onPointerDownCapture={onFooterHandlePointerDown}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span>
          {headerBandOn ? <>Cabeçalho ~{Math.round(headerPt)}&nbsp;pt</> : null}
          {headerBandOn && footerBandOn ? " · " : null}
          {footerBandOn ? <>Rodapé ~{Math.round(footerPt)}&nbsp;pt</> : null}
        </span>
        {!isReadOnly && (headerBandOn || footerBandOn) ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() =>
              patch({
                cover_pdf_header_band_height_pt: DEFAULT_COVER_HEADER_BAND_PT,
                cover_pdf_footer_band_height_pt: DEFAULT_COVER_FOOTER_BAND_PT,
              })
            }
          >
            Alturas padrão
          </Button>
        ) : null}
      </div>
      {!isReadOnly && (headerBandOn || footerBandOn) ? (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Arraste as barras pontilhadas ou use os deslizadores na coluna da esquerda (secção &quot;Alturas no
          PDF&quot;).
        </p>
      ) : null}
    </div>
  );
}

export function CompositorCoverPdfBandsDialog({
  open,
  onOpenChange,
  coverProps,
  patch,
  budget,
  isReadOnly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverProps: CoverBlockProps;
  patch: (partial: Partial<CoverBlockProps>) => void;
  budget: Budget | null;
  isReadOnly?: boolean;
}) {
  const [settings, setSettings] = useState<ProposalSettings | null>(null);
  const [coverLogoUploading, setCoverLogoUploading] = useState(false);
  const coverLogoFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getProposalSettingsAction().then((res) => {
      if (cancelled) return;
      if (res.success && res.data) setSettings(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleCoverLogoFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCoverLogoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/library", { method: "POST", body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        toast.error(json.error || "Falha ao enviar a imagem");
        return;
      }
      patch({ cover_pdf_header_logo_url_override: json.url });
      toast.success("Logo da capa atualizado no rascunho.");
    } catch {
      toast.error("Erro ao enviar a imagem");
    } finally {
      setCoverLogoUploading(false);
    }
  };

  const bothCoverBandsOff =
    coverProps.cover_pdf_show_header_band === false &&
    coverProps.cover_pdf_show_footer_band === false;

  const headerBandChecked = coverProps.cover_pdf_show_header_band !== false;
  const footerBandChecked = coverProps.cover_pdf_show_footer_band !== false;
  const headerPtForm = clampCoverHeaderBandPt(
    coverProps.cover_pdf_header_band_height_pt,
    DEFAULT_COVER_HEADER_BAND_PT,
  );
  const footerPtForm = clampCoverFooterBandPt(
    coverProps.cover_pdf_footer_band_height_pt,
    DEFAULT_COVER_FOOTER_BAND_PT,
  );

  return (
    <Dialog modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(96vh,900px)] w-[calc(100vw-1.5rem)] max-w-5xl min-h-0 flex-col gap-0 overflow-y-auto overflow-x-hidden p-0 sm:max-w-5xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-lg">Cabeçalho e rodapé da capa (PDF)</DialogTitle>
          <p className="text-xs font-normal text-muted-foreground">
            Faixas fixas fora do texto da capa — como no Word. O restante do PDF continua igual; dados da empresa em{" "}
            <Link href="/settings" className="font-medium text-primary underline-offset-2 hover:underline">
              Configurações
            </Link>
            .
          </p>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_minmax(280px,400px)] lg:divide-x lg:divide-border">
          <div className="min-h-0 overflow-y-auto p-5">
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cover-pdf-hdr"
                      checked={coverProps.cover_pdf_show_header_band !== false}
                      onCheckedChange={(v) =>
                        patch({ cover_pdf_show_header_band: v === true })
                      }
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="cover-pdf-hdr" className="cursor-pointer text-sm font-normal">
                      Mostrar faixa superior (logo + nome)
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="cover-pdf-ftr"
                      checked={coverProps.cover_pdf_show_footer_band !== false}
                      onCheckedChange={(v) =>
                        patch({ cover_pdf_show_footer_band: v === true })
                      }
                      disabled={isReadOnly}
                    />
                    <Label htmlFor="cover-pdf-ftr" className="cursor-pointer text-sm font-normal">
                      Mostrar faixa inferior (textos)
                    </Label>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-8 px-2.5 text-xs"
                    disabled={isReadOnly}
                    onClick={() => {
                      if (bothCoverBandsOff) {
                        patch({
                          cover_pdf_show_header_band: true,
                          cover_pdf_show_footer_band: true,
                        });
                      } else {
                        patch({
                          cover_pdf_show_header_band: false,
                          cover_pdf_show_footer_band: false,
                        });
                      }
                    }}
                  >
                    {bothCoverBandsOff ? "Mostrar faixas na capa" : "Sem faixas na capa"}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Atalho: desliga ou liga cabeçalho e rodapé desta capa no PDF.
                  </span>
                </div>
              </div>
              <Separator />
              {!bothCoverBandsOff && !isReadOnly ? (
                <div className="space-y-4 rounded-md border border-border bg-muted/25 p-3">
                  <div>
                    <Label className="text-xs font-medium">Alturas no PDF (pontos)</Label>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                      1 pt ≈ 1/72 pol. Estes controlos respondem aos checkboxes acima (faixa ligada = pode ajustar).
                    </p>
                  </div>
                  {headerBandChecked ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span>Faixa superior</span>
                        <span className="tabular-nums text-muted-foreground">{headerPtForm} pt</span>
                      </div>
                      <input
                        type="range"
                        min={COVER_HEADER_BAND_PT_MIN}
                        max={COVER_HEADER_BAND_PT_MAX}
                        step={1}
                        value={headerPtForm}
                        className="w-full accent-primary"
                        onChange={(e) =>
                          patch({
                            cover_pdf_header_band_height_pt:
                              Number(e.target.value) || DEFAULT_COVER_HEADER_BAND_PT,
                          })
                        }
                      />
                    </div>
                  ) : null}
                  {footerBandChecked ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span>Faixa inferior</span>
                        <span className="tabular-nums text-muted-foreground">{footerPtForm} pt</span>
                      </div>
                      <input
                        type="range"
                        min={COVER_FOOTER_BAND_PT_MIN}
                        max={COVER_FOOTER_BAND_PT_MAX}
                        step={1}
                        value={footerPtForm}
                        className="w-full accent-primary"
                        onChange={(e) =>
                          patch({
                            cover_pdf_footer_band_height_pt:
                              Number(e.target.value) || DEFAULT_COVER_FOOTER_BAND_PT,
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Substituir nome no cabeçalho (opcional)
                </Label>
                <Input
                  placeholder="Opcional — vazio não substitui o nome"
                  value={coverProps.cover_pdf_header_company_override ?? ""}
                  onChange={(e) =>
                    patch({ cover_pdf_header_company_override: e.target.value })
                  }
                  disabled={isReadOnly}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Logo do cabeçalho da capa (opcional)
                </Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    className="h-9 flex-1 text-sm"
                    placeholder="URL ou envie um arquivo — vazio usa Configurações"
                    value={coverProps.cover_pdf_header_logo_url_override ?? ""}
                    onChange={(e) =>
                      patch({ cover_pdf_header_logo_url_override: e.target.value })
                    }
                    disabled={isReadOnly}
                  />
                  <input
                    ref={coverLogoFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="sr-only"
                    onChange={handleCoverLogoFileSelected}
                    disabled={isReadOnly}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    disabled={isReadOnly || coverLogoUploading}
                    onClick={() => coverLogoFileInputRef.current?.click()}
                  >
                    {coverLogoUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Enviar imagem
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  JPG, PNG, GIF ou WEBP até 5&nbsp;MB. Substitui só o logo desta capa no PDF.
                </p>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs font-medium">Rodapé esquerdo</Label>
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Vazio = linha em branco no PDF. Placeholders:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{date}}"}</code>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{code}}"}</code>{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px]">{"{{title}}"}</code>
                </p>
                <Textarea
                  rows={2}
                  placeholder="Opcional"
                  value={coverProps.cover_pdf_footer_left_template ?? ""}
                  onChange={(e) =>
                    patch({ cover_pdf_footer_left_template: e.target.value })
                  }
                  disabled={isReadOnly}
                  className="min-h-[52px] text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium">Rodapé direito</Label>
                <p className="text-[11px] text-muted-foreground">
                  Vazio = linha em branco no PDF. Ex.: <code className="rounded bg-muted px-1 text-[10px]">Cód. {"{{code}}"}</code>
                </p>
                <Textarea
                  rows={2}
                  placeholder="Opcional"
                  value={coverProps.cover_pdf_footer_right_template ?? ""}
                  onChange={(e) =>
                    patch({ cover_pdf_footer_right_template: e.target.value })
                  }
                  disabled={isReadOnly}
                  className="min-h-[52px] text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-muted/30 p-5 lg:border-t-0">
            <p className="text-sm font-medium text-muted-foreground">Pré-visualização</p>
            <CoverPdfBandInteractivePreview
              coverProps={coverProps}
              settings={settings}
              budget={budget}
              patch={patch}
              isReadOnly={Boolean(isReadOnly)}
            />
            <p className="text-[10px] leading-snug text-muted-foreground">
              Aproximação do PDF; ajustes finos de margem podem variar levemente na impressão.
            </p>
            <Button variant="outline" size="sm" className="w-full gap-2 text-xs" asChild>
              <Link href="/settings">
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir Configurações (empresa)
              </Link>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
