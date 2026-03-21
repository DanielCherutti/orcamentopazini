"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

/**
 * Items per page selector
 * Persists selection in URL params
 */
export function ItemsPerPageSelector() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentLimit = searchParams.get("limit") || "10";

    const handleChange = (value: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("limit", value);
        params.set("page", "1"); // Reset to first page
        router.push(`?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Itens por página:</span>
            <Select value={currentLimit} onValueChange={handleChange}>
                <SelectTrigger className="w-[80px] rounded-sm">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-sm">
                    {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option.toString()}>
                            {option}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
