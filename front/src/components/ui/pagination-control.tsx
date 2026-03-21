"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

interface PaginationProps {
    meta: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export function Pagination({ meta }: PaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());
        router.push(`?${params.toString()}`);
    };

    if (meta.totalPages <= 1) return null;

    return (
        <div className="flex items-center justify-end space-x-2 py-4">
            <div className="text-sm text-muted-foreground mr-4">
                Página {meta.page} de {meta.totalPages} ({meta.total} itens)
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(meta.page - 1)}
                disabled={meta.page <= 1}
            >
                <ChevronLeft className="h-4 w-4" />
                Anterior
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(meta.page + 1)}
                disabled={meta.page >= meta.totalPages}
            >
                Próximo
                <ChevronRight className="h-4 w-4" />
            </Button>
        </div>
    );
}
