"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AuditLogEntry } from "@/types/audit-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

type Props = {
    entries: AuditLogEntry[];
    total: number;
    basePath?: string;
};

export function AuditLogTable({ entries, total, basePath = "" }: Props) {
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [action, setAction] = useState("");

    function applyFilters() {
        const params = new URLSearchParams();
        if (search.trim()) params.set("search", search.trim());
        if (action.trim()) params.set("action", action.trim());
        const q = params.toString();
        router.push(q ? `${basePath}?${q}` : basePath || "?");
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <Label htmlFor="audit-search" className="text-xs">
                        Buscar
                    </Label>
                    <Input
                        id="audit-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Resumo…"
                        className="h-9 w-48"
                    />
                </div>
                <div className="space-y-1">
                    <Label htmlFor="audit-action" className="text-xs">
                        Ação
                    </Label>
                    <Input
                        id="audit-action"
                        value={action}
                        onChange={(e) => setAction(e.target.value)}
                        placeholder="product.create"
                        className="h-9 w-40"
                    />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={applyFilters}>
                    Filtrar
                </Button>
                <p className="text-xs text-muted-foreground ml-auto">{total} registro(s)</p>
            </div>

            <div className="rounded-lg border overflow-x-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Ator</TableHead>
                            <TableHead>Ação</TableHead>
                            <TableHead>Recurso</TableHead>
                            <TableHead>Resumo</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entries.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                                    Nenhum registro encontrado.
                                </TableCell>
                            </TableRow>
                        ) : (
                            entries.map((e) => (
                                <TableRow key={e.id}>
                                    <TableCell className="whitespace-nowrap text-xs">
                                        {e.created_at.slice(0, 16).replace("T", " ")}
                                    </TableCell>
                                    <TableCell className="text-xs">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="truncate max-w-[140px]">{e.actor_email}</span>
                                            <Badge variant="outline" className="w-fit text-[10px]">
                                                {e.actor_kind}
                                            </Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs">{e.action}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground">
                                        {e.resource_type}
                                        {e.resource_id ? ` · ${e.resource_id.slice(0, 20)}…` : ""}
                                    </TableCell>
                                    <TableCell className="text-sm max-w-md truncate">{e.summary}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
