"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useKeyboardPagination } from "@/hooks/use-keyboard-pagination";

interface PaginationAdvancedProps {
    currentPage: number;
    totalPages: number;
    baseUrl: string;
    searchParams?: Record<string, string>;
}

/**
 * Advanced pagination with complete navigation controls
 * Shows: First (<<), Previous (<), Page X of Y, Next (>), Last (>>)
 * Keyboard: ← Previous, → Next
 */
export function PaginationAdvanced({
    currentPage,
    totalPages,
    baseUrl,
    searchParams = {},
}: PaginationAdvancedProps) {
    // Enable keyboard shortcuts
    useKeyboardPagination({ currentPage, totalPages, baseUrl });

    const buildUrl = (page: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", page.toString());
        return `${baseUrl}?${params.toString()}`;
    };

    const getPageNumbers = () => {
        const pages: (number | string)[] = [];
        const maxVisible = 5; // Reduced for mobile

        if (totalPages <= maxVisible) {
            // Show all pages
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Show with ellipsis
            if (currentPage <= 3) {
                // Near start: 1 2 3 4 ... 10
                for (let i = 1; i <= 4; i++) pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            } else if (currentPage >= totalPages - 2) {
                // Near end: 1 ... 7 8 9 10
                pages.push(1);
                pages.push("...");
                for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i);
            } else {
                // Middle: 1 ... 4 5 6 ... 10
                pages.push(1);
                pages.push("...");
                for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                pages.push("...");
                pages.push(totalPages);
            }
        }

        return pages;
    };

    if (totalPages <= 1) return null;

    return (
        <div className="flex flex-col sm:flex-row items-center gap-4">
            {/* Page Indicator (Mobile/Desktop) */}
            <div className="text-sm text-muted-foreground font-medium">
                Página {currentPage} de {totalPages}
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-1">
                {/* First Button */}
                <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={currentPage === 1}
                    className="rounded-sm h-9 w-9 p-0"
                    aria-label="Primeira página"
                    title="Primeira página"
                >
                    {currentPage === 1 ? (
                        <span className="cursor-not-allowed opacity-50">
                            <ChevronsLeft className="h-4 w-4" />
                        </span>
                    ) : (
                        <Link href={buildUrl(1)}>
                            <ChevronsLeft className="h-4 w-4" />
                        </Link>
                    )}
                </Button>

                {/* Previous Button */}
                <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={currentPage === 1}
                    className="rounded-sm h-9 px-3"
                    aria-label="Página anterior (←)"
                    title="Página anterior (←)"
                >
                    {currentPage === 1 ? (
                        <span className="cursor-not-allowed opacity-50 flex items-center gap-1">
                            <ChevronLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Anterior</span>
                        </span>
                    ) : (
                        <Link href={buildUrl(currentPage - 1)} className="flex items-center gap-1">
                            <ChevronLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Anterior</span>
                        </Link>
                    )}
                </Button>

                {/* Page Numbers (Hidden on mobile) */}
                <div className="hidden md:flex items-center gap-1" role="navigation" aria-label="Paginação">
                    {getPageNumbers().map((page, idx) =>
                        page === "..." ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground" aria-hidden="true">
                                ...
                            </span>
                        ) : (
                            <Button
                                key={page}
                                variant={currentPage === page ? "default" : "outline"}
                                size="sm"
                                asChild
                                className="rounded-sm min-w-[36px] h-9"
                                aria-label={`Página ${page}`}
                                aria-current={currentPage === page ? "page" : undefined}
                            >
                                <Link href={buildUrl(page as number)}>{page}</Link>
                            </Button>
                        )
                    )}
                </div>

                {/* Next Button */}
                <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={currentPage === totalPages}
                    className="rounded-sm h-9 px-3"
                    aria-label="Próxima página (→)"
                    title="Próxima página (→)"
                >
                    {currentPage === totalPages ? (
                        <span className="cursor-not-allowed opacity-50 flex items-center gap-1">
                            <span className="hidden sm:inline">Próximo</span>
                            <ChevronRight className="h-4 w-4" />
                        </span>
                    ) : (
                        <Link href={buildUrl(currentPage + 1)} className="flex items-center gap-1">
                            <span className="hidden sm:inline">Próximo</span>
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    )}
                </Button>

                {/* Last Button */}
                <Button
                    variant="outline"
                    size="sm"
                    asChild
                    disabled={currentPage === totalPages}
                    className="rounded-sm h-9 w-9 p-0"
                    aria-label="Última página"
                    title="Última página"
                >
                    {currentPage === totalPages ? (
                        <span className="cursor-not-allowed opacity-50">
                            <ChevronsRight className="h-4 w-4" />
                        </span>
                    ) : (
                        <Link href={buildUrl(totalPages)}>
                            <ChevronsRight className="h-4 w-4" />
                        </Link>
                    )}
                </Button>
            </div>
        </div>
    );
}
