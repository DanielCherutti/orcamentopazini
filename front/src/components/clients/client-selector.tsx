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
import { searchClientsAction, type Client } from "@/actions/client-actions";

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

    const handleSearch = useDebouncedCallback(async (term: string) => {
        setLoading(true);
        const { success, data } = await searchClientsAction(term);
        if (success && data) {
            setClients(data);
        }
        setLoading(false);
    }, 300);

    React.useEffect(() => {
        handleSearch("");
    }, [handleSearch]);

    React.useEffect(() => {
        if (value) {
            const found = clients.find((client) => client.id === value);
            if (!found && !loading) {
                handleSearch("");
            }
        }
    }, [value, handleSearch, loading]);

    React.useEffect(() => {
        if (value) {
            const found = clients.find((client) => client.id === value);
            if (!found) {
                handleSearch("");
            }
        }
    }, [value, handleSearch]);

    // If ID is provided but we don't have client name, we might want to fetch it.
    // Simplifying: we trust the parent or just show ID if name missing for now,
    // or rely on the list being populated. Since we don't have 'getClient(id)' yet,
    // we assume the user picks from the list.

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
                        ? clients.find((client) => client.id === value)?.name || "Cliente selecionado"
                        : "Selecione um cliente..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
                <Command shouldFilter={false}>
                    {/* We handle filtering server-side */}
                    <CommandInput
                        placeholder="Buscar cliente..."
                        onValueChange={handleSearch}
                    />
                    <CommandList>
                        {loading && <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>}
                        {!loading && clients.length === 0 && (
                            <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                        )}
                        {!loading && (
                            <CommandGroup>
                                {clients.map((client) => (
                                    <CommandItem
                                        key={client.id}
                                        value={client.id}
                                        onSelect={(currentValue) => {
                                            onSelect(currentValue); // Keep passing ID string to satisfy controller for now if only ID needed
                                            // But we want to pass full object to parent for mock logic
                                            // Let's rely on parent finding it, or better: change prop signature.
                                            // Keeping signature standard for now, but exporting clients state? No.
                                            // Parent can't access `clients` state here.
                                            // Let's modify onClientSelect prop if possible.
                                            if (onClientSelect) onClientSelect(client);
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
                                            {client.email && <span className="text-xs text-muted-foreground">{client.email}</span>}
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
