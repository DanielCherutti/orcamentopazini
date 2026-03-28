"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useDebouncedCallback } from "use-debounce";
import Link from "next/link";
import { ChevronDown, ChevronUp, FileText, ImageIcon, LayoutList, RefreshCw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateBlockAction } from "@/actions/budget-compositor-block-actions";
import { getBudgetAction } from "@/actions/budget-actions";
import { getProposalSettingsAction, type ProposalSettings } from "@/actions/settings-actions";
import { getCustomerAction } from "@/actions/client-actions";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import type { CoverBlockProps } from "@/types/budget-compositor-types";
import type { CoverSectionId, CoverSectionAlign } from "@/types/budget-compositor-types";
import {
  COVER_SECTION_LABELS,
  DEFAULT_COVER_PROPS,
  coverSectionAlignFor,
  normalizeCoverSectionOrder,
  normalizeCoverTitlesOrder,
} from "@/types/budget-compositor-types";
import type { Budget } from "@/types/budget-types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

function mergeCoverProps(raw: Record<string, unknown> | undefined): CoverBlockProps {
  return { ...DEFAULT_COVER_PROPS, ...(raw as CoverBlockProps) };
}

function textAlignCls(a: CoverSectionAlign): string {
  if (a === "left") return "text-left";
  if (a === "right") return "text-right";
  return "text-center";
}

const paperInput =
  "rounded-none border-0 border-b border-neutral-300/80 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-neutral-800 dark:border-neutral-600 dark:focus-visible:border-neutral-300";

function CoverFieldRow({
  label,
  value,
  onChange,
  readOnly,
  className,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  if (readOnly && !(value && String(value).trim())) return null;
  return (
    <div className={cn("flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2", className)}>
      <span className="w-full shrink-0 text-[8px] font-bold uppercase tracking-wide text-neutral-500 sm:w-[108px]">
        {label}
      </span>
      {readOnly || !onChange ? (
        <p className="min-h-[1em] flex-1 text-[10px] leading-snug text-neutral-900">{value}</p>
      ) : (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={cn("h-7 flex-1 px-0.5 py-0 text-[10px] text-neutral-900", paperInput)}
        />
      )}
    </div>
  );
}

export function CompositorCoverBlock({
  block,
  budgetId,
  isReadOnly,
}: {
  block: BudgetBlock;
  budgetId: string;
  isReadOnly?: boolean;
}) {
  const [props, setProps] = useState<CoverBlockProps>(() => mergeCoverProps(block.props));
  const [budget, setBudget] = useState<Budget | null>(null);
  const [settings, setSettings] = useState<ProposalSettings | null>(null);
  const [loadingClient, setLoadingClient] = useState(false);

  useEffect(() => {
    setProps(mergeCoverProps(block.props));
  }, [block.props]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBudgetAction(budgetId), getProposalSettingsAction()]).then(([bRes, sRes]) => {
      if (cancelled) return;
      if (bRes.success && bRes.data) setBudget(bRes.data as Budget);
      if (sRes.success && sRes.data) setSettings(sRes.data);
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
        const next = { ...prev, ...partial };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const issueDate = useMemo(() => {
    const raw = budget?.issue_date || budget?.created_at;
    if (!raw) return new Date();
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [budget?.issue_date, budget?.created_at]);

  const formattedDateLong = issueDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const refLine = [budget?.code, props.revision_label?.trim()].filter(Boolean).join(" · ");

  const sectionOrder = useMemo(() => normalizeCoverSectionOrder(props.section_order), [props.section_order]);
  const titlesOrder = useMemo(() => normalizeCoverTitlesOrder(props.titles_order), [props.titles_order]);

  const moveSectionByIndex = (i: number, dir: -1 | 1) => {
    const next = [...sectionOrder];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ section_order: next });
  };

  const moveTitleByIndex = (i: number, dir: -1 | 1) => {
    const next = [...titlesOrder];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ titles_order: next });
  };

  const setSectionAlign = (id: CoverSectionId, v: CoverSectionAlign) => {
    patch({ section_align: { ...(props.section_align ?? {}), [id]: v } });
  };

  const renderCoverSection = (id: CoverSectionId): ReactNode => {
    const align = coverSectionAlignFor(id, props.section_align);
    const tac = textAlignCls(align);

    switch (id) {
      case "company_header":
        return (
          <div
            key={id}
            className={cn(
              "w-full shrink-0 border-b border-border/80 pb-2",
              align === "center" && "flex flex-col items-center gap-1 text-center",
              align === "left" && "flex flex-row justify-between items-start gap-2",
              align === "right" && "flex flex-col items-end gap-1 text-right",
            )}
          >
            <div className="min-w-0">
              {settings?.company_logo_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={settings.company_logo_url}
                  alt=""
                  className={cn(
                    "h-9 w-auto max-w-[128px] object-contain",
                    align === "right" && "ml-auto",
                    align === "center" && "mx-auto",
                  )}
                />
              ) : (
                <span className="block truncate text-sm font-bold text-neutral-900">
                  {settings?.company_name || "Empresa"}
                </span>
              )}
            </div>
            <div
              className={cn(
                "max-w-[90%] text-[7px] leading-snug text-neutral-500",
                align === "left" && "text-right max-w-[45%]",
              )}
            >
              Dados da empresa vêm de{" "}
              <Link href="/settings" className="text-blue-700 underline dark:text-blue-400">
                Configurações
              </Link>
              .
            </div>
          </div>
        );

      case "main_titles":
        return (
          <div key={id} className={cn("w-full shrink-0 space-y-2 py-2", tac)}>
            {titlesOrder.map((part) =>
              part === "main" ? (
                !isReadOnly ? (
                  <Input
                    key="main"
                    value={props.main_title ?? ""}
                    placeholder="Título principal"
                    onChange={(e) => patch({ main_title: e.target.value })}
                    className={cn(
                      "h-auto min-h-8 border-neutral-400/70 py-1 text-sm font-black uppercase tracking-tight text-neutral-900 sm:text-[15px]",
                      paperInput,
                      tac,
                    )}
                  />
                ) : (
                  <h1
                    key="main"
                    className="text-sm font-black uppercase tracking-tight text-neutral-900 sm:text-base"
                  >
                    {props.main_title || "PROPOSTA COMERCIAL"}
                  </h1>
                )
              ) : !isReadOnly ? (
                <Input
                  key="subtitle"
                  value={props.subtitle ?? ""}
                  placeholder="Subtítulo"
                  onChange={(e) => patch({ subtitle: e.target.value })}
                  className={cn(
                    "h-auto min-h-7 text-[10px] text-neutral-700 sm:text-[11px]",
                    paperInput,
                    tac,
                  )}
                />
              ) : (
                <p key="subtitle" className="text-[10px] text-neutral-600 sm:text-[11px] px-0.5">
                  {props.subtitle}
                </p>
              ),
            )}
          </div>
        );

      case "client_logo":
        if (!props.client_logo_url) {
          return (
            <div
              key={id}
              className={cn(
                "w-full shrink-0 py-3",
                tac,
                !isReadOnly &&
                  "rounded-sm border border-dashed border-neutral-400/70 bg-neutral-50/50 px-3 py-6 dark:border-neutral-600 dark:bg-neutral-900/20",
              )}
            >
              <p className="text-[9px] italic text-neutral-500">
                {isReadOnly
                  ? "—"
                  : "Logomarca do cliente — defina a URL no painel Mídia à direita"}
              </p>
            </div>
          );
        }
        return (
          <div key={id} className={cn("w-full shrink-0 py-3", tac)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.client_logo_url}
              alt=""
              className={cn(
                "inline-block max-h-[88px] max-w-[72%] object-contain",
                align === "center" && "mx-auto block",
                align === "right" && "ml-auto block",
              )}
            />
          </div>
        );

      case "client_cadastral":
        if (!isReadOnly) {
          return (
            <div key={id} className={cn("w-full shrink-0 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700", tac)}>
              <CoverFieldRow
                label="Razão social"
                value={props.client_legal_name}
                onChange={(v) => patch({ client_legal_name: v })}
              />
              <CoverFieldRow
                label="Nome fantasia"
                value={props.client_trade_name}
                onChange={(v) => patch({ client_trade_name: v })}
              />
              <CoverFieldRow label="CNPJ" value={props.client_cnpj} onChange={(v) => patch({ client_cnpj: v })} />
              <CoverFieldRow
                label="Município / UF"
                value={props.client_municipality}
                onChange={(v) => patch({ client_municipality: v })}
              />
              <CoverFieldRow
                label="Endereço"
                value={props.client_address}
                onChange={(v) => patch({ client_address: v })}
              />
              <CoverFieldRow label="CEP" value={props.client_cep} onChange={(v) => patch({ client_cep: v })} />
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
                <span className="w-full shrink-0 text-[8px] font-bold uppercase tracking-wide text-neutral-500 sm:w-[108px] pt-1">
                  Tipos EC / área
                </span>
                <Textarea
                  value={props.client_classified_areas ?? ""}
                  onChange={(e) => patch({ client_classified_areas: e.target.value })}
                  rows={2}
                  className="min-h-[48px] flex-1 resize-y rounded-sm border border-neutral-200/90 bg-white px-2 py-1 text-[10px] text-neutral-900 shadow-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:border-neutral-600 dark:bg-neutral-950/30"
                />
              </div>
            </div>
          );
        }
        return (
          <div key={id} className={cn("w-full shrink-0 space-y-1 text-[9px] text-neutral-900 sm:text-[10px]", tac)}>
            {props.client_legal_name ? (
              <p>
                <span className="font-semibold">RAZÃO SOCIAL:</span> {props.client_legal_name}
              </p>
            ) : null}
            {props.client_trade_name ? (
              <p>
                <span className="font-semibold">NOME FANTASIA:</span> {props.client_trade_name}
              </p>
            ) : null}
            {props.client_cnpj ? (
              <p>
                <span className="font-semibold">CNPJ:</span> {props.client_cnpj}
              </p>
            ) : null}
            {props.client_municipality ? (
              <p>
                <span className="font-semibold">MUNICÍPIO:</span> {props.client_municipality}
              </p>
            ) : null}
            {props.client_address ? (
              <p>
                <span className="font-semibold">ENDEREÇO:</span> {props.client_address}
              </p>
            ) : null}
            {props.client_cep ? (
              <p>
                <span className="font-semibold">CEP:</span> {props.client_cep}
              </p>
            ) : null}
            {props.client_classified_areas ? (
              <p>
                <span className="font-semibold">TIPOS DE EC / ÁREA CLASSIFICADA:</span>{" "}
                {props.client_classified_areas}
              </p>
            ) : null}
          </div>
        );

      case "professional_footer":
        if (!isReadOnly) {
          return (
            <div
              key={id}
              className={cn(
                "w-full shrink-0 space-y-2 border-t border-neutral-200 pt-3 text-[10px] text-neutral-900 dark:border-neutral-700",
                tac,
              )}
            >
              <Input
                value={props.engineer_name ?? ""}
                placeholder="Responsável técnico / proposta"
                onChange={(e) => patch({ engineer_name: e.target.value })}
                className={cn("h-8 font-semibold uppercase", paperInput, tac)}
              />
              <div className="flex flex-wrap items-end gap-2 sm:gap-4">
                <div className="min-w-[120px] flex-1">
                  <span className="text-[8px] font-bold uppercase text-neutral-500">CREA</span>
                  <Input
                    value={props.engineer_crea ?? ""}
                    placeholder="Ex.: RS - 188715"
                    onChange={(e) => patch({ engineer_crea: e.target.value })}
                    className={cn("h-7 text-[10px]", paperInput)}
                  />
                </div>
                <div className="min-w-[140px] flex-1">
                  <span className="text-[8px] font-bold uppercase text-neutral-500">Cidade / UF</span>
                  <Input
                    value={props.issuer_city_line ?? ""}
                    placeholder="Ex.: Iraí - RS"
                    onChange={(e) => patch({ issuer_city_line: e.target.value })}
                    className={cn("h-7 text-[10px]", paperInput)}
                  />
                </div>
              </div>
              <p className="text-[9px] text-neutral-600">
                {(props.issuer_city_line || "—").toUpperCase()}, {formattedDateLong.toUpperCase()}
                <span className="mx-1 text-neutral-400">·</span>
                <span className="text-neutral-500">data da proposta</span>
              </p>
              <div className={cn("flex flex-wrap items-center gap-2 text-[9px]", tac === "text-center" && "justify-center")}>
                {budget?.code ? (
                  <span className="font-mono text-neutral-800 dark:text-neutral-200">Ref: {budget.code}</span>
                ) : null}
                <Input
                  value={props.revision_label ?? ""}
                  placeholder="Revisão (ex.: Rev. 02)"
                  onChange={(e) => patch({ revision_label: e.target.value })}
                  className={cn("h-7 min-w-[120px] max-w-[200px] flex-1 font-mono text-[9px]", paperInput)}
                />
              </div>
            </div>
          );
        }
        return (
          <div key={id} className={cn("w-full shrink-0 space-y-2 pt-2 text-[9px] text-neutral-900 sm:text-[10px]", tac)}>
            {props.engineer_name ? <p className="font-semibold uppercase">{props.engineer_name}</p> : null}
            {props.engineer_crea ? <p>CREA: {props.engineer_crea}</p> : null}
            <p className="text-neutral-600">
              {(props.issuer_city_line || "—").toUpperCase()}, {formattedDateLong.toUpperCase()}
            </p>
            {refLine ? <p className="font-mono text-[9px] text-neutral-800">Ref: {refLine}</p> : null}
          </div>
        );

      default:
        return null;
    }
  };

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

  const layoutPanel = (
    <div className="space-y-3 p-1">
      <p className="text-[11px] text-muted-foreground leading-snug">
        Ordene os blocos da capa e o alinhamento de cada região. O resultado aparece na folha ao lado.
      </p>
      <div className="space-y-2">
        {sectionOrder.map((sid, i) => (
          <div
            key={sid}
            className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 text-xs font-medium leading-tight">{COVER_SECTION_LABELS[sid]}</span>
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Mover bloco para cima"
                disabled={isReadOnly || i === 0}
                onClick={() => moveSectionByIndex(i, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Mover bloco para baixo"
                disabled={isReadOnly || i === sectionOrder.length - 1}
                onClick={() => moveSectionByIndex(i, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Select
              value={coverSectionAlignFor(sid, props.section_align)}
              onValueChange={(v) => setSectionAlign(sid, v as CoverSectionAlign)}
              disabled={isReadOnly}
            >
              <SelectTrigger
                className="h-7 w-[118px] shrink-0 text-xs"
                aria-label={`Alinhamento: ${COVER_SECTION_LABELS[sid]}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <Separator />
      <p className="text-xs font-medium text-foreground">Título e subtítulo</p>
      <div className="space-y-1.5">
        {titlesOrder.map((part, i) => (
          <div
            key={part}
            className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5"
          >
            <span className="min-w-0 flex-1 text-xs">{part === "main" ? "Título principal" : "Subtítulo"}</span>
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Mover para cima"
                disabled={isReadOnly || i === 0}
                onClick={() => moveTitleByIndex(i, -1)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Mover para baixo"
                disabled={isReadOnly || i === titlesOrder.length - 1}
                onClick={() => moveTitleByIndex(i, 1)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const mediaPanel = (
    <div className="space-y-4 p-1">
      <p className="text-[11px] text-muted-foreground leading-snug">
        URLs públicas (biblioteca de imagens ou CDN). A logomarca aparece na folha quando a URL for válida.
      </p>
      <div className="space-y-2">
        <Label htmlFor={`cover-clogo-${block.id}`} className="text-xs">
          Logomarca do cliente
        </Label>
        <Input
          id={`cover-clogo-${block.id}`}
          placeholder="https://..."
          value={props.client_logo_url ?? ""}
          onChange={(e) => patch({ client_logo_url: e.target.value })}
          disabled={isReadOnly}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`cover-wm1-${block.id}`} className="text-xs">
          Marca d’água da capa
        </Label>
        <Input
          id={`cover-wm1-${block.id}`}
          placeholder="https://..."
          value={props.cover_watermark_url ?? ""}
          onChange={(e) => patch({ cover_watermark_url: e.target.value })}
          disabled={isReadOnly}
          className="h-8 text-xs"
        />
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
        <Input
          id={`cover-wm2-${block.id}`}
          placeholder="https://..."
          value={props.document_watermark_url ?? ""}
          onChange={(e) => patch({ document_watermark_url: e.target.value })}
          disabled={isReadOnly}
          className="h-8 text-xs"
        />
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
    <div className="overflow-hidden rounded-lg border border-neutral-300/90 bg-neutral-200/50 shadow-sm dark:border-neutral-700 dark:bg-neutral-950/40">
      <header className="flex flex-wrap items-center gap-2 border-b border-neutral-300/90 bg-gradient-to-b from-neutral-50 to-neutral-200/95 px-3 py-2 dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-950">
        <div className="flex items-center gap-2 border-r border-neutral-300 pr-3 dark:border-neutral-600">
          <FileText className="h-4 w-4 shrink-0 text-neutral-600 dark:text-neutral-400" />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">Capa</h2>
            <p className="hidden text-[10px] text-neutral-500 sm:block dark:text-neutral-400">
              Edite o texto na folha; layout e imagens no painel à direita
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
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loadingClient && "animate-spin")} />
              Preencher cliente
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-neutral-300 bg-white text-xs shadow-sm dark:border-neutral-600 dark:bg-neutral-800"
            asChild
          >
            <Link href="/settings">
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />
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

      <div className="flex max-h-[min(88vh,920px)] min-h-[420px] flex-col lg:flex-row lg:items-stretch">
        <div className="flex min-h-[380px] flex-1 items-start justify-center overflow-auto bg-[#b9b9b9] px-3 py-6 sm:px-6 sm:py-10 dark:bg-neutral-900/90">
          <div className="flex w-full max-w-[540px] flex-col items-stretch gap-2">
            <div className="flex items-center justify-between px-1 font-mono text-[9px] uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              <span>Página 1</span>
              <span className="opacity-80">A4</span>
            </div>
            <div
              className="relative w-full overflow-hidden rounded-[1px] bg-white text-neutral-900 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.08),0_12px_28px_rgba(0,0,0,0.14)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
              style={{ aspectRatio: "210 / 297" }}
            >
              {props.cover_watermark_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={props.cover_watermark_url}
                  alt=""
                  className="pointer-events-none absolute inset-0 m-auto max-h-[82%] max-w-[82%] object-contain"
                  style={{ opacity: props.cover_watermark_opacity ?? 0.12 }}
                />
              ) : null}
              <div className="relative z-[1] flex h-full min-h-0 flex-col px-[7%] pb-[6%] pt-[7%] text-[11px] leading-snug">
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                  {sectionOrder.map((sid) => renderCoverSection(sid))}
                </div>
                <div className="mt-3 h-0.5 shrink-0 bg-neutral-300/90 dark:bg-neutral-600" />
              </div>
            </div>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col border-t border-neutral-300/90 bg-background dark:border-neutral-700 lg:w-[min(100%,320px)] lg:max-w-[360px] lg:border-l lg:border-t-0">
          <Tabs defaultValue="layout" className="flex min-h-0 flex-1 flex-col">
            <TabsList
              variant="line"
              className="h-9 w-full shrink-0 justify-start gap-0 rounded-none border-b border-border bg-muted/20 px-1"
            >
              <TabsTrigger value="layout" className="gap-1.5 text-xs">
                <LayoutList className="h-3.5 w-3.5 opacity-70" />
                Layout
              </TabsTrigger>
              <TabsTrigger value="media" className="gap-1.5 text-xs">
                <ImageIcon className="h-3.5 w-3.5 opacity-70" />
                Mídia
              </TabsTrigger>
            </TabsList>
            <TabsContent value="layout" className="m-0 flex-1 overflow-y-auto focus-visible:outline-none">
              <ScrollArea className="h-[min(42vh,360px)] lg:h-[min(calc(88vh-96px),820px)]">
                <div className="p-3">{layoutPanel}</div>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="media" className="m-0 flex-1 overflow-y-auto focus-visible:outline-none">
              <ScrollArea className="h-[min(42vh,360px)] lg:h-[min(calc(88vh-96px),820px)]">
                <div className="p-3">{mediaPanel}</div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
          <div className="border-t border-border px-3 py-2 text-[10px] leading-snug text-muted-foreground">
            O código do orçamento e a data na capa vêm dos <strong className="font-medium text-foreground">dados da proposta</strong>.
          </div>
        </aside>
      </div>
    </div>
  );
}
