"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { getCustomerAction, searchClientsAction, type Client } from "@/actions/client-actions";

interface ClientSelectorProps {
    value?: string;
    onSelect: (clientId: string) => void;
    onClientSelect?: (client: Client) => void;
    error?: boolean;
}

export function ClientSelector({ value, onSelect, onClientSelect, error }: ClientSelectorProps) {
    const [open, setOpen] = React.useState(false);
    const [clients, setClients] = React.useState<Client[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");
    const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);
    const requestIdRef = React.useRef(0);

    const doSearch = React.useCallback(async (term: string) => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const { success, data } = await searchClientsAction(term);
            if (requestId !== requestIdRef.current) return;
            setClients(success && data ? data : []);
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, []);

    const handleSearch = useDebouncedCallback((term: string) => {
        doSearch(term);
    }, 300);

    React.useEffect(() => {
        if (!open) return;
        setSearchValue("");
        doSearch("");
    }, [open, doSearch]);

    React.useEffect(() => {
        if (!value) {
            setSelectedLabel(null);
            return;
        }

        const found = clients.find((client) => client.id === value);
        if (found) {
            setSelectedLabel(found.name);
            return;
        }

        let cancelled = false;
        getCustomerAction(value).then((res) => {
            if (!cancelled && res.success && res.data) {
                setSelectedLabel(res.data.name);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [value, clients]);

    const handleValueChange = (term: string) => {
        setSearchValue(term);
        if (!term.trim()) {
            handleSearch.cancel();
            doSearch("");
        } else {
            handleSearch(term);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn("w-full justify-between", error && "border-red-500", !value && "text-muted-foreground")}
                >
                    {value
                        ? selectedLabel || clients.find((client) => client.id === value)?.name || "Cliente selecionado"
                        : "Selecione um cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Buscar cliente..."
                        value={searchValue}
                        onValueChange={handleValueChange}
                    />
                    <CommandList>
                        {loading && (
                            <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
                        )}
                        {!loading && clients.length === 0 && (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                Nenhum cliente encontrado.
                            </div>
                        )}
                        {!loading && clients.length > 0 && (
                            <CommandGroup>
                                {clients.map((client) => (
                                    <CommandItem
                                        key={client.id}
                                        value={`${client.name} ${client.email || ""} ${client.cnpj || ""} ${client.id}`}
                                        onSelect={() => {
                                            onSelect(client.id);
                                            if (onClientSelect) onClientSelect(client);
                                            setSelectedLabel(client.name);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === client.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex flex-col">
                                            <span>{client.name}</span>
                                            {client.email && (
                                                <span className="text-xs text-muted-foreground">{client.email}</span>
                                            )}
                                            {(client.city || client.cnpj) && (
                                                <span className="text-xs text-muted-foreground">
                                                    {[client.city, client.cnpj].filter(Boolean).join(" - ")}
                                                </span>
                                            )}
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
