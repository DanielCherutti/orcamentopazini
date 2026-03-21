"use client";

import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDebouncedCallback } from "use-debounce";

export function SearchInput() {
    const searchParams = useSearchParams();
    const { replace } = useRouter();

    const handleSearch = useDebouncedCallback((term: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (term) {
            params.set("query", term);
        } else {
            params.delete("query");
        }
        // Reset page to 1 when searching
        params.set("page", "1");

        replace(`?${params.toString()}`);
    }, 300);

    return (
        <div className="relative max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
                type="search"
                placeholder="Buscar por código ou descrição..."
                className="h-11 w-full rounded-xl border-border/80 bg-muted/40 pl-10 shadow-inner transition-shadow focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/25"
                onChange={(e) => handleSearch(e.target.value)}
                defaultValue={searchParams.get("query")?.toString()}
            />
        </div>
    );
}
