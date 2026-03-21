"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";

/**
 * Active search badge
 * Shows current search term with clear button
 */
export function SearchBadge() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const query = searchParams.get("query");

    if (!query) return null;

    const handleClear = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("query");
        params.set("page", "1"); // Reset to first page
        router.push(`?${params.toString()}`);
    };

    return (
        <Badge variant="secondary" className="rounded-sm gap-1">
            Busca: <span className="font-semibold">{query}</span>
            <button
                onClick={handleClear}
                className="ml-1 hover:bg-muted rounded-sm p-0.5"
                aria-label="Limpar busca"
            >
                <X className="h-3 w-3" />
            </button>
        </Badge>
    );
}
