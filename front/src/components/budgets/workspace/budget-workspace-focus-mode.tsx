"use client";

import { useEffect, useRef } from "react";
import { useSidebar } from "@/components/layout/sidebar-context";

/** Colapsa o menu lateral ao entrar no workspace de orçamento; restaura ao sair. */
export function BudgetWorkspaceFocusMode() {
    const { collapsed, setCollapsed } = useSidebar();
    const previousRef = useRef<boolean | null>(null);

    useEffect(() => {
        previousRef.current = collapsed;
        setCollapsed(true);
        return () => {
            if (previousRef.current != null) {
                setCollapsed(previousRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem do workspace
    }, []);

    return null;
}
