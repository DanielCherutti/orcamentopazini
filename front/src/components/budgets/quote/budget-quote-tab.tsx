"use client";

import { memo, useCallback, useEffect, useMemo, useState, type FocusEvent } from "react";
import { getBudgetAction } from "@/actions/budget-actions";
import { updateBudgetAction } from "@/actions/budget-core-write-actions";
import type { Budget } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    ChevronDown,
    ChevronRight,
    Loader2,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Layers,
    TableProperties,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    applyQuoteRowAdjustments,
    computeLocationQuoteBreakdown,
    type ScopePricingItem,
} from "@/lib/budgets/scope-pricing";

const formatCurrency = (val: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

/** Com valor 0 e input numérico controlado, o browser concatena dígitos (ex.: 010). Selecionar no foco substitui ao digitar. */
function selectPercentInputIfZero(e: FocusEvent<HTMLInputElement>, current: number) {
    if (current === 0) {
        e.target.select();
    }
}

function mapItemToPricing(
    raw: Record<string, unknown>,
    sectionId: string
): ScopePricingItem & { section_id: string } {
    const mode = raw.price_adjustment_mode;
    return {
        id: raw.id != null ? String(raw.id) : undefined,
        section_id: sectionId,
        quantity: Number(raw.quantity ?? 1),
        unit_price: Number(raw.unit_price ?? 0),
        labor_cost: Number(raw.labor_cost ?? 0),
        price_adjustment_mode:
            mode === "percent" || mode === "fixed" ? mode : null,
        price_adjustment_value: Number(raw.price_adjustment_value ?? 0),
        observation_extra_value: Number(raw.observation_extra_value ?? 0),
        assembly_manual_value: Number(raw.assembly_manual_value ?? 0),
    };
}

type TableRow = {
    key: string;
    label: string;
    equipment: number;
    assembly: number;
    /** Com trechos visíveis: linha de total do local; trechos são filhas logo abaixo. */
    rowType: "location" | "section";
};

const QuoteCostRow = memo(function QuoteCostRow({
    row,
    locationOrdinal,
}: {
    row: TableRow;
    locationOrdinal: number | null;
}) {
    const isLoc = row.rowType === "location";
    return (
        <tr
            className={cn(
                "transition-colors",
                isLoc
                    ? "bg-gradient-to-r from-primary/[0.06] via-muted/20 to-transparent hover:from-primary/[0.08]"
                    : "bg-background/50 hover:bg-muted/25"
            )}
        >
            <td
                className={cn(
                    "px-4 py-2.5 align-middle tabular-nums",
                    isLoc ? "font-semibold text-foreground" : "text-muted-foreground/40"
                )}
            >
                {isLoc && locationOrdinal != null ? locationOrdinal : "—"}
            </td>
            <td
                className={cn(
                    "px-4 py-2.5 align-middle",
                    isLoc
                        ? "border-l-[3px] border-l-primary font-semibold text-foreground"
                        : "border-l border-l-primary/15 pl-8 text-[13px] text-muted-foreground"
                )}
            >
                {isLoc ? (
                    row.label
                ) : (
                    <span className="flex items-center gap-2">
                        <span className="h-1 w-1 shrink-0 rounded-full bg-primary/35" aria-hidden />
                        {row.label}
                    </span>
                )}
            </td>
            <td
                className={cn(
                    "px-4 py-2.5 text-right tabular-nums tracking-tight align-middle",
                    isLoc ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
            >
                {formatCurrency(row.equipment)}
            </td>
            <td
                className={cn(
                    "px-4 py-2.5 text-right tabular-nums tracking-tight align-middle",
                    isLoc ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
            >
                {formatCurrency(row.assembly)}
            </td>
        </tr>
    );
});

interface BudgetQuoteTabProps {
    budgetId: string;
    isReadOnly: boolean;
    onBudgetRefresh?: () => void | Promise<void>;
}

function CollapsibleTextBlock({
    title,
    value,
    onChange,
    onPersist,
    disabled,
}: {
    title: string;
    value: string;
    onChange: (v: string) => void;
    onPersist: (v: string) => void;
    disabled: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/80 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-sm dark:ring-white/[0.04]">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50"
            >
                <span
                    className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 text-muted-foreground",
                        open && "bg-primary/10 text-primary"
                    )}
                >
                    {open ? (
                        <ChevronDown className="h-4 w-4" />
                    ) : (
                        <ChevronRight className="h-4 w-4" />
                    )}
                </span>
                <span className="text-foreground/90">{title}</span>
            </button>
            {open && (
                <Textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => onPersist(e.currentTarget.value)}
                    disabled={disabled}
                    placeholder="Texto opcional…"
                    className="min-h-[120px] resize-y rounded-none border-0 border-t border-border/50 bg-muted/20 px-4 py-3 text-sm focus-visible:ring-0"
                />
            )}
        </div>
    );
}

export function BudgetQuoteTab({ budgetId, isReadOnly, onBudgetRefresh }: BudgetQuoteTabProps) {
    const [loading, setLoading] = useState(true);
    const [budget, setBudget] = useState<Budget | null>(null);
    const [markupPct, setMarkupPct] = useState(0);
    const [discountPct, setDiscountPct] = useState(0);
    const [showSections, setShowSections] = useState(false);
    const [noteAbove, setNoteAbove] = useState("");
    const [noteBelow, setNoteBelow] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        const res = await getBudgetAction(budgetId);
        if (res.success && res.data) {
            const b = res.data as Budget;
            setBudget(b);
            setMarkupPct(Number((b as unknown as Record<string, unknown>).quote_markup_percent ?? 0));
            setDiscountPct(Number((b as unknown as Record<string, unknown>).quote_discount_percent ?? 0));
            setShowSections(
                Boolean((b as unknown as Record<string, unknown>).quote_show_sections ?? false)
            );
            setNoteAbove(String((b as unknown as Record<string, unknown>).quote_note_above ?? ""));
            setNoteBelow(String((b as unknown as Record<string, unknown>).quote_note_below ?? ""));
        }
        setLoading(false);
    }, [budgetId]);

    useEffect(() => {
        void load();
    }, [load]);

    const persist = useCallback(
        async (patch: Partial<Budget>) => {
            if (isReadOnly) return;
            await updateBudgetAction(budgetId, patch);
            await onBudgetRefresh?.();
        },
        [budgetId, isReadOnly, onBudgetRefresh]
    );

    const tableRows = useMemo((): TableRow[] => {
        if (!budget?.locations?.length) return [];
        const rows: TableRow[] = [];
        const locs = [...budget.locations].sort(
            (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
        );

        for (const loc of locs) {
            const sections = [...(loc.sections ?? [])].sort(
                (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)
            );
            const items: Array<ScopePricingItem & { section_id: string }> = [];
            for (const sec of sections) {
                const rawItems = (sec as unknown as { items?: Record<string, unknown>[] }).items ?? [];
                for (const it of rawItems) {
                    if (!it || typeof it !== "object") continue;
                    items.push(mapItemToPricing(it as Record<string, unknown>, String(sec.id)));
                }
            }

            const breakdown = computeLocationQuoteBreakdown({
                location: {
                    assembly_mode: loc.assembly_mode,
                    assembly_value: loc.assembly_value,
                },
                sections: sections.map((s) => ({
                    id: String(s.id),
                    assembly_mode: s.assembly_mode,
                    assembly_value: s.assembly_value,
                })),
                items,
            });

            if (showSections) {
                const locAdj = applyQuoteRowAdjustments(
                    breakdown.collapsedEquipment,
                    breakdown.collapsedAssembly,
                    markupPct,
                    discountPct
                );
                rows.push({
                    key: `loc-${loc.id}`,
                    label: String(loc.name),
                    equipment: locAdj.equipment,
                    assembly: locAdj.assembly,
                    rowType: "location",
                });
                for (const sec of sections) {
                    const sr = breakdown.sectionRows.find((r) => r.sectionId === String(sec.id));
                    if (!sr) continue;
                    const adj = applyQuoteRowAdjustments(
                        sr.equipment,
                        sr.assembly,
                        markupPct,
                        discountPct
                    );
                    rows.push({
                        key: `sec-${sec.id}`,
                        label: String(sec.name),
                        equipment: adj.equipment,
                        assembly: adj.assembly,
                        rowType: "section",
                    });
                }
            } else {
                const adj = applyQuoteRowAdjustments(
                    breakdown.collapsedEquipment,
                    breakdown.collapsedAssembly,
                    markupPct,
                    discountPct
                );
                rows.push({
                    key: `loc-${loc.id}`,
                    label: String(loc.name),
                    equipment: adj.equipment,
                    assembly: adj.assembly,
                    rowType: "location",
                });
            }
        }

        return rows;
    }, [budget, showSections, markupPct, discountPct]);

    const totals = useMemo(() => {
        let eq = 0;
        let as = 0;
        for (const r of tableRows) {
            if (showSections && r.rowType === "section") continue;
            eq += r.equipment;
            as += r.assembly;
        }
        return {
            equipment: Math.round(eq * 100) / 100,
            assembly: Math.round(as * 100) / 100,
            grand: Math.round((eq + as) * 100) / 100,
        };
    }, [tableRows, showSections]);

    const quoteTableBodyRows = useMemo(() => {
        let locIndex = 0;
        return tableRows.map((row) => {
            const isLoc = row.rowType === "location";
            if (isLoc) locIndex += 1;
            return {
                row,
                locationOrdinal: isLoc ? locIndex : null,
            };
        });
    }, [tableRows]);

    if (loading && !budget) {
        return (
            <div className="flex flex-1 items-center justify-center bg-background">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-muted/30 via-background to-background">
            <div className="shrink-0 border-b border-border/60 bg-card/60 px-4 py-4 shadow-sm backdrop-blur-md">
                <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                    <div className="flex flex-wrap items-stretch gap-3">
                        <label
                            htmlFor="quote-sections"
                            className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition-all",
                                showSections
                                    ? "border-primary/35 bg-primary/[0.07] ring-2 ring-primary/15"
                                    : "border-border/70 bg-card hover:border-border hover:bg-muted/30"
                            )}
                        >
                            <Checkbox
                                id="quote-sections"
                                checked={showSections}
                                disabled={isReadOnly}
                                className="data-[state=checked]:border-primary data-[state=checked]:bg-primary"
                                onCheckedChange={(v) => {
                                    const next = v === true;
                                    setShowSections(next);
                                    void persist({ quote_show_sections: next });
                                }}
                            />
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                    <Layers className="h-3.5 w-3.5 shrink-0 text-primary" />
                                    Incluir trechos
                                </span>
                                <span className="text-[11px] leading-snug text-muted-foreground">
                                    Uma linha por trecho abaixo de cada local
                                </span>
                            </div>
                        </label>

                        <div className="flex min-w-[9rem] flex-col gap-1.5 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 to-emerald-50/30 px-4 py-3 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/50 dark:to-emerald-950/20">
                            <Label
                                htmlFor="quote-vara"
                                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-300/90"
                            >
                                <TrendingUp className="h-3.5 w-3.5" />
                                Vara (acréscimo)
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="quote-vara"
                                    type="number"
                                    className="h-10 w-[4.75rem] rounded-xl border-emerald-200/80 bg-white/90 text-center text-base font-semibold tabular-nums shadow-inner dark:border-emerald-800/60 dark:bg-emerald-950/40"
                                    disabled={isReadOnly}
                                    value={Number.isFinite(markupPct) ? markupPct : 0}
                                    onFocus={(e) => selectPercentInputIfZero(e, markupPct)}
                                    onChange={(e) => setMarkupPct(Number(e.target.value))}
                                    onBlur={() =>
                                        void persist({
                                            quote_markup_percent: Number.isFinite(markupPct)
                                                ? markupPct
                                                : 0,
                                        })
                                    }
                                />
                                <span className="text-sm font-semibold text-emerald-800/80 dark:text-emerald-400/90">
                                    %
                                </span>
                            </div>
                        </div>

                        <div className="flex min-w-[9rem] flex-col gap-1.5 rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 to-orange-50/25 px-4 py-3 shadow-sm dark:border-rose-900/40 dark:from-rose-950/45 dark:to-orange-950/15">
                            <Label
                                htmlFor="quote-discount"
                                className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-rose-800 dark:text-rose-300/90"
                            >
                                <TrendingDown className="h-3.5 w-3.5" />
                                Desconto
                            </Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="quote-discount"
                                    type="number"
                                    className="h-10 w-[4.75rem] rounded-xl border-rose-200/80 bg-white/90 text-center text-base font-semibold tabular-nums shadow-inner dark:border-rose-800/60 dark:bg-rose-950/40"
                                    disabled={isReadOnly}
                                    value={Number.isFinite(discountPct) ? discountPct : 0}
                                    onFocus={(e) => selectPercentInputIfZero(e, discountPct)}
                                    onChange={(e) => setDiscountPct(Number(e.target.value))}
                                    onBlur={() =>
                                        void persist({
                                            quote_discount_percent: Number.isFinite(discountPct)
                                                ? discountPct
                                                : 0,
                                        })
                                    }
                                />
                                <span className="text-sm font-semibold text-rose-800/80 dark:text-rose-400/90">
                                    %
                                </span>
                            </div>
                        </div>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-11 shrink-0 gap-2 rounded-xl border-border/80 bg-card px-4 font-medium shadow-sm transition-all hover:border-primary/30 hover:bg-primary/[0.04] hover:text-primary"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                        Atualizar valores
                    </Button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6">
                <div className="mx-auto max-w-5xl space-y-5">
                    <CollapsibleTextBlock
                        title="Descrição (acima da tabela) — opcional, recolhível"
                        value={noteAbove}
                        disabled={isReadOnly}
                        onChange={setNoteAbove}
                        onPersist={(v) => void persist({ quote_note_above: v })}
                    />

                    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-lg shadow-black/[0.04] ring-1 ring-black/[0.02] dark:bg-card dark:shadow-black/20 dark:ring-white/[0.04]">
                        <div className="relative border-b border-border/50 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent px-5 py-4">
                            <div className="flex items-center justify-center gap-2 sm:absolute sm:left-5 sm:top-1/2 sm:-translate-y-1/2 sm:justify-start">
                                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                                    <TableProperties className="h-4 w-4" />
                                </span>
                            </div>
                            <h2 className="text-center text-sm font-bold uppercase tracking-[0.12em] text-foreground/90 sm:pl-12">
                                Custos de equipamentos — Pazini
                            </h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[640px] text-[13px]">
                                <thead>
                                    <tr className="border-b border-border/60 bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                                        <th className="w-14 px-4 py-3.5 text-left font-semibold">Nº</th>
                                        <th className="min-w-[12rem] px-4 py-3.5 text-left font-semibold">
                                            Local / trecho
                                        </th>
                                        <th className="w-[8.5rem] px-4 py-3.5 text-right font-semibold">
                                            Equipamentos
                                        </th>
                                        <th className="w-[8.5rem] px-4 py-3.5 text-right font-semibold">
                                            Montagem
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                    {tableRows.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={4}
                                                className="px-4 py-14 text-center text-sm text-muted-foreground"
                                            >
                                                Nenhum local no escopo. Configure locais na aba{" "}
                                                <span className="font-medium text-foreground">Escopo</span>.
                                            </td>
                                        </tr>
                                    ) : (
                                        quoteTableBodyRows.map(({ row, locationOrdinal }) => (
                                            <QuoteCostRow
                                                key={row.key}
                                                row={row}
                                                locationOrdinal={locationOrdinal}
                                            />
                                        ))
                                    )}
                                </tbody>
                                {tableRows.length > 0 && (
                                    <tfoot>
                                        <tr className="border-t-2 border-amber-200/80 bg-gradient-to-r from-amber-100/95 via-amber-50/90 to-amber-100/80 dark:border-amber-800/50 dark:from-amber-950/70 dark:via-amber-950/50 dark:to-amber-950/65">
                                            <td
                                                colSpan={2}
                                                className="px-4 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-amber-950 dark:text-amber-100"
                                            >
                                                Totais
                                            </td>
                                            <td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums text-amber-950 dark:text-amber-50">
                                                {formatCurrency(totals.equipment)}
                                            </td>
                                            <td className="px-4 py-3.5 text-right text-sm font-bold tabular-nums text-amber-950 dark:text-amber-50">
                                                {formatCurrency(totals.assembly)}
                                            </td>
                                        </tr>
                                        <tr className="border-t border-amber-200/50 bg-amber-50/80 dark:border-amber-900/40 dark:bg-amber-950/40">
                                            <td colSpan={2} />
                                            <td className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/80">
                                                Equipamentos
                                            </td>
                                            <td className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/80">
                                                Montagem
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    <CollapsibleTextBlock
                        title="Descrição (abaixo da tabela) — opcional, recolhível"
                        value={noteBelow}
                        disabled={isReadOnly}
                        onChange={setNoteBelow}
                        onPersist={(v) => void persist({ quote_note_below: v })}
                    />
                </div>
            </div>
        </div>
    );
}
