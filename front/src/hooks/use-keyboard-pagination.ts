"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface UseKeyboardPaginationProps {
    currentPage: number;
    totalPages: number;
    baseUrl: string;
}

/**
 * Keyboard shortcuts for pagination
 * ← Previous page
 * → Next page
 */
export function useKeyboardPagination({
    currentPage,
    totalPages,
    baseUrl,
}: UseKeyboardPaginationProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement
            ) {
                return;
            }

            const params = new URLSearchParams(searchParams.toString());

            if (e.key === "ArrowLeft" && currentPage > 1) {
                params.set("page", (currentPage - 1).toString());
                router.push(`${baseUrl}?${params.toString()}`);
            } else if (e.key === "ArrowRight" && currentPage < totalPages) {
                params.set("page", (currentPage + 1).toString());
                router.push(`${baseUrl}?${params.toString()}`);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentPage, totalPages, baseUrl, router, searchParams]);
}
