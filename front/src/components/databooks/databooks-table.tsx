"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Edit, FileText, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { duplicateDatabookTemplateAction } from "@/actions/databook-template-actions";
import { toast } from "@/lib/toast";
import type { DatabookTemplate } from "@/types/databook-template-types";

export function DatabooksTable({ templates }: { templates: DatabookTemplate[] }) {
    const router = useRouter();

    const handleDuplicate = async (id: string) => {
        const res = await duplicateDatabookTemplateAction(id);
        if (res.success && res.id) {
            toast.success("DataBook duplicado");
            router.push(`/dashboard/databooks/${encodeURIComponent(res.id)}`);
        } else {
            toast.error(res.error || "Erro ao duplicar");
        }
    };

    if (templates.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum DataBook cadastrado.
            </p>
        );
    }

    return (
        <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
                <thead className="bg-muted/50">
                    <tr>
                        <th className="text-left p-3 font-medium">Nome</th>
                        <th className="text-left p-3 font-medium hidden md:table-cell">Cliente</th>
                        <th className="text-center p-3 font-medium">Áreas</th>
                        <th className="text-center p-3 font-medium hidden sm:table-cell">Memorial</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        <th className="p-3 w-24" />
                    </tr>
                </thead>
                <tbody>
                    {templates.map((t) => (
                        <tr key={t.id} className="border-t hover:bg-muted/30">
                            <td className="p-3">
                                <Link
                                    href={`/dashboard/databooks/${encodeURIComponent(t.id!)}`}
                                    className="font-medium hover:underline inline-flex items-center gap-1"
                                >
                                    {t.is_default ? (
                                        <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                    ) : null}
                                    {t.name}
                                </Link>
                                {t.description ? (
                                    <p className="text-xs text-muted-foreground truncate max-w-md mt-0.5">
                                        {t.description}
                                    </p>
                                ) : null}
                            </td>
                            <td className="p-3 text-muted-foreground hidden md:table-cell">
                                {t.client_label || "—"}
                            </td>
                            <td className="p-3 text-center tabular-nums">{t.areas.length}</td>
                            <td className="p-3 text-center hidden sm:table-cell">
                                {t.reference_file ? (
                                    <span
                                        title={t.reference_file.filename}
                                        className="inline-flex"
                                    >
                                        <FileText
                                            className="h-4 w-4 text-green-600"
                                            aria-hidden
                                        />
                                    </span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                )}
                            </td>
                            <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                    {t.is_default ? (
                                        <Badge variant="secondary">Padrão</Badge>
                                    ) : null}
                                    {t.active ? (
                                        <Badge variant="outline">Ativo</Badge>
                                    ) : (
                                        <Badge variant="destructive">Inativo</Badge>
                                    )}
                                </div>
                            </td>
                            <td className="p-3">
                                <div className="flex justify-end gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        title="Duplicar"
                                        onClick={() => handleDuplicate(t.id!)}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link
                                            href={`/dashboard/databooks/${encodeURIComponent(t.id!)}`}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
