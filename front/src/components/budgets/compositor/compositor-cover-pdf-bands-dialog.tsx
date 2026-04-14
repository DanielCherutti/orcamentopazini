"use client";

import { useEffect, useRef, useState } from "react";
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
  resolveCoverPdfShowFooterBand,
} from "@/lib/pdf/cover-pdf-band-resolve";
import { buildPdfContactLines } from "@/lib/pdf/pdf-proposal-header";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

function CoverPdfBandPreview({
  coverProps,
  settings,
  budget,
}: {
  coverProps: CoverBlockProps;
  settings: ProposalSettings | null;
  budget: Budget | null;
}) {
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
  const showHeader = shouldShowCoverPdfHeaderBand(coverProps, settings ?? undefined);
  const showFooter = resolveCoverPdfShowFooterBand(coverProps);
  const left = formatCoverPdfFooterLeftText(coverProps, ctx);
  const right = formatCoverPdfFooterRightText(coverProps, ctx);
  const subtitle = fill ? settings?.company_header_subtitle?.trim() || "" : "";
  const contactLines = fill && settings ? buildPdfContactLines(settings) : [];

  return (
    <div
      className={cn(
        "relative mx-auto overflow-hidden rounded border border-neutral-300 bg-white shadow-sm dark:border-neutral-600 dark:bg-neutral-950",
      )}
      style={{ width: 300, aspectRatio: "210 / 297" }}
    >
      {showHeader ? (
        <div className="absolute left-0 right-0 top-0 z-10 border-b border-neutral-200 px-2 py-2 dark:border-neutral-700">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-start gap-1.5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- preview leve; URL pública
                <img
                  src={logoUrl}
                  alt=""
                  className="h-8 w-16 shrink-0 object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              <div className="min-w-0">
                {company ? (
                  <p className="text-[9px] font-bold uppercase leading-tight text-primary">{company}</p>
                ) : (
                  <p className="text-[7px] italic text-muted-foreground">Nome em Configurações</p>
                )}
                {subtitle ? (
                  <p className="mt-0.5 text-[6px] uppercase tracking-[0.2em] text-primary">{subtitle}</p>
                ) : null}
              </div>
            </div>
            {contactLines.length > 0 ? (
              <div className="max-w-[48%] shrink-0 text-right">
                {contactLines.map((line, i) => (
                  <p key={i} className="text-[6px] leading-snug text-primary">
                    {line}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          "absolute left-2 right-2 text-[7px] leading-snug text-muted-foreground",
          showHeader ? "top-10" : "top-3",
          showFooter ? "bottom-10" : "bottom-3",
        )}
      >
        <p className="text-center">Conteúdo da capa (editor)</p>
      </div>
      {showFooter ? (
        <div className="absolute bottom-0 left-0 right-0 z-10 flex items-start justify-between gap-1 border-t border-neutral-200 px-2 py-1 dark:border-neutral-700">
          <span className="line-clamp-2 min-w-0 flex-1 text-[7px] text-muted-foreground">{left}</span>
          <span className="line-clamp-2 max-w-[45%] shrink-0 text-right text-[7px] text-muted-foreground">
            {right}
          </span>
        </div>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(96vh,900px)] w-[calc(100vw-1.5rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
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
        <div className="grid min-h-0 min-h-[min(72vh,640px)] flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_minmax(280px,400px)] lg:divide-x lg:divide-border">
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
          <div className="flex flex-col gap-4 border-t border-border bg-muted/30 p-5 lg:border-t-0">
            <p className="text-sm font-medium text-muted-foreground">Pré-visualização</p>
            <CoverPdfBandPreview coverProps={coverProps} settings={settings} budget={budget} />
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
