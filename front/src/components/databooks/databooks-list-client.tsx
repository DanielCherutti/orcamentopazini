"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getDatabookTemplatesAction } from "@/actions/databook-template-actions";
import { DatabooksTable } from "@/components/databooks/databooks-table";
import type { DatabookTemplate } from "@/types/databook-template-types";

interface DatabooksListClientProps {
    initialTemplates: DatabookTemplate[];
    initialMeta: { total: number; page: number; limit: number; totalPages: number };
    query: string;
}

export function DatabooksListClient({
    initialTemplates,
    initialMeta,
    query,
}: DatabooksListClientProps) {
    const searchParams = useSearchParams();
    const [templates, setTemplates] = useState(initialTemplates);
    const [meta, setMeta] = useState(initialMeta);
    const [loading, setLoading] = useState(false);
    const isFirst = useRef(true);

    const page = Number(searchParams.get("page")) || 1;
    const urlQuery = searchParams.get("query") || "";

    useEffect(() => {
        setTemplates(initialTemplates);
        setMeta(initialMeta);
    }, [initialTemplates, initialMeta]);

    useEffect(() => {
        if (isFirst.current) {
            isFirst.current = false;
            return;
        }
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            const res = await getDatabookTemplatesAction({
                page,
                query: urlQuery,
                limit: 20,
            });
            if (!cancelled && res.success && res.data && res.meta) {
                setTemplates(res.data);
                setMeta(res.meta);
            }
            if (!cancelled) setLoading(false);
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [page, urlQuery]);

    return (
        <div className={loading ? "opacity-60 pointer-events-none transition-opacity" : ""}>
            <p className="text-sm text-muted-foreground mb-4">
                {meta.total} DataBook(s)
                {query ? ` · busca: “${query}”` : ""}
            </p>
            <DatabooksTable templates={templates} />
        </div>
    );
}
