"use client";

import { useState, useEffect, useRef } from "react";
import { User, X, Search } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { searchClientsAction, getCustomerAction } from "@/actions/client-actions";
import { updateBudgetAction } from "@/actions/budget-core-write-actions";
import { cn } from "@/lib/utils";
import type { Client } from "@/actions/client-actions";

interface ClientSelectorProps {
    budgetId: string;
    clientId: string;
    isReadOnly?: boolean;
    onClientChange?: (clientId: string, clientName: string) => void;
}

export function ClientSelector({ budgetId, clientId, isReadOnly = false, onClientChange }: ClientSelectorProps) {
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [clientName, setClientName] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Client[]>([]);
    const [searching, setSearching] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Carrega nome do cliente atual
    useEffect(() => {
        let cancelled = false;
        if (!clientId) {
            setClientName(null);
            return;
        }
        getCustomerAction(clientId).then((res) => {
            if (!cancelled && res.success && res.data) setClientName(res.data.name);
        });
        return () => {
            cancelled = true;
        };
    }, [clientId]);

    // Busca debounced
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await searchClientsAction(query);
                if (cancelled) return;
                if (res.success && res.data) setResults(res.data);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [query, open]);

    // Foca o input ao abrir
    useEffect(() => {
        if (open) {
            setQuery("");
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const handleSelect = async (client: Client) => {
        setSaving(true);
        setClientName(client.name);
        setOpen(false);
        await updateBudgetAction(budgetId, { client_id: String(client.id) });
        setSaving(false);
        onClientChange?.(String(client.id), client.name);
    };

    const handleClear = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setClientName(null);
        await updateBudgetAction(budgetId, { client_id: "" });
        onClientChange?.("", "");
    };

    if (isReadOnly) {
        return (
            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                <User className="h-3 w-3" />
                {clientName || "Sem cliente"}
            </span>
        );
    }

    const triggerClassName = cn(
        "flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors shrink-0",
        clientName
            ? "border-border bg-background hover:bg-muted text-foreground"
            : "border-dashed border-border hover:border-primary hover:text-primary text-muted-foreground"
    );

    const triggerLabel = (
        <>
            <User className="h-3 w-3 shrink-0" />
            <span className="max-w-[140px] truncate">
                {clientName || "Selecionar cliente"}
            </span>
        </>
    );

    if (!mounted) {
        return (
            <div className="flex items-center gap-0.5 shrink-0">
                <button
                    type="button"
                    className={triggerClassName}
                    title={clientName ? "Clique para trocar cliente" : "Selecionar cliente"}
                    disabled={saving}
                >
                    {triggerLabel}
                </button>
                {clientName ? (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="p-1 rounded-md opacity-40 hover:opacity-100 transition-opacity"
                        title="Remover cliente"
                        disabled={saving}
                    >
                        <X className="h-2.5 w-2.5" />
                    </button>
                ) : null}
            </div>
        );
    }

    return (
        <div className="flex items-center gap-0.5 shrink-0">
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={triggerClassName}
                        title={clientName ? "Clique para trocar cliente" : "Selecionar cliente"}
                        disabled={saving}
                    >
                        {triggerLabel}
                    </button>
                </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="start">
                <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        ref={inputRef}
                        placeholder="Buscar cliente..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        className="h-8 pl-7 text-sm"
                    />
                </div>
                <div className="max-h-52 overflow-y-auto space-y-0.5">
                    {searching ? (
                        <p className="text-xs text-muted-foreground px-2 py-3 text-center">Buscando...</p>
                    ) : results.length === 0 ? (
                        <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                            {query ? "Nenhum cliente encontrado" : "Digite para buscar"}
                        </p>
                    ) : (
                        results.map((c) => (
                            <button
                                key={String(c.id)}
                                type="button"
                                className="w-full text-left px-2 py-1.5 rounded-sm text-sm hover:bg-muted transition-colors"
                                onClick={() => handleSelect(c)}
                            >
                                <div className="font-medium leading-tight">{c.name}</div>
                                {c.details && (
                                    <div className="text-xs text-muted-foreground leading-tight">{c.details}</div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
            </Popover>
            {clientName ? (
                <button
                    type="button"
                    onClick={handleClear}
                    className="p-1 rounded-md opacity-40 hover:opacity-100 transition-opacity"
                    title="Remover cliente"
                    disabled={saving}
                >
                    <X className="h-2.5 w-2.5" />
                </button>
            ) : null}
        </div>
    );
}
