"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCompositorRuntime } from "./compositor-runtime-context";
import type { BudgetBlock } from "@/types/budget-compositor-types";
import { toast } from "@/lib/toast";

/** Normaliza casing: seção raiz → UPPERCASE, subseções/locais → Title Case */
export function normalizeLabel(label: string, block: BudgetBlock): string {
    if (block.type === "scope") return label.toUpperCase();
    const isRootSession = block.type === "session" && block.depth === 0;
    if (isRootSession) return label.toUpperCase();
    if (block.type === "session" || block.type === "location") {
        return label.replace(/\w\S*/g, (w) =>
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
        );
    }
    return label;
}

export function useBlockLabel(
    block: BudgetBlock,
    budgetId: string,
    onRefresh: () => void,
) {
    const { actions } = useCompositorRuntime();
    return useCallback(
        async (newLabel: string) => {
            const normalized = normalizeLabel(newLabel.trim(), block);
            const result = await actions.updateBlockAction(block.id, budgetId, {
                label: normalized,
            });
            if (!result.success) toast.error(result.error || "Erro ao renomear");
            else onRefresh();
        },
        [block.id, block.type, block.depth, budgetId, onRefresh, actions],
    );
}

export function useBlockDescription(
    block: BudgetBlock,
    budgetId: string,
    onRefresh: () => void,
) {
    const { actions } = useCompositorRuntime();
    const [description, setDescription] = useState(
        (block.props.description as string) || "",
    );
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<string | null>(null);

    useEffect(() => {
        setDescription((block.props.description as string) || "");
        pendingRef.current = null;
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, [block.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (pendingRef.current !== null) {
                void actions.updateBlockAction(block.id, budgetId, {
                    props: { description: pendingRef.current },
                });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [block.id]);

    const handleChange = useCallback(
        (html: string) => {
            setDescription(html);
            pendingRef.current = html;
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(async () => {
                await actions.updateBlockAction(block.id, budgetId, {
                    props: { description: html },
                });
                pendingRef.current = null;
                onRefresh();
            }, 1500);
        },
        [block.id, budgetId, onRefresh, actions],
    );

    return { description, handleChange };
}
