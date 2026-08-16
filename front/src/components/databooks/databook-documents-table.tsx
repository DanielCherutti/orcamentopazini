"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, Download, Pencil, Trash2 } from "lucide-react";
import { deleteDatabookAction, duplicateDatabookAction } from "@/actions/databook-actions";
import { toast } from "@/lib/toast";
import type { Databook } from "@/types/databook-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DatabookDocumentsTable({ documents }: { documents: Databook[] }) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [deleteTarget, setDeleteTarget] = useState<Databook | null>(null);

    const duplicate = (document: Databook) => startTransition(async () => {
        const result = await duplicateDatabookAction(document.id);
        if (!result.success || !result.id) {
            toast.error(result.error ?? "Erro ao duplicar DataBook");
            return;
        }
        toast.success("DataBook duplicado");
        router.push(`/dashboard/databook-documents/${encodeURIComponent(result.id)}`);
    });

    const remove = () => {
        if (!deleteTarget) return;
        startTransition(async () => {
            const result = await deleteDatabookAction(deleteTarget.id);
            if (!result.success) {
                toast.error(result.error ?? "Erro ao excluir DataBook");
                return;
            }
            toast.success("DataBook excluído");
            setDeleteTarget(null);
            router.refresh();
        });
    };

    if (!documents.length) {
        return <p className="py-10 text-center text-sm text-muted-foreground">Nenhum DataBook criado.</p>;
    }

    return <>
        <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr>
                    <th className="p-3 text-left">Código</th>
                    <th className="p-3 text-left">Título</th>
                    <th className="p-3 text-left">Projeto/obra</th>
                    <th className="p-3 text-center">Instalações</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Atualizado</th>
                    <th className="p-3 text-right">Ações</th>
                </tr></thead>
                <tbody>{documents.map((item) => (
                    <tr key={item.id} className="border-t hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{item.code}</td>
                        <td className="p-3 font-medium">{item.title}</td>
                        <td className="p-3 text-muted-foreground">{item.project_name || item.worksite_name || "—"}</td>
                        <td className="p-3 text-center tabular-nums">{item.installation_count ?? 0}</td>
                        <td className="p-3"><Badge variant="outline">{item.status === "draft" ? "Rascunho" : item.status}</Badge></td>
                        <td className="p-3 text-muted-foreground">{item.updated_at ? new Intl.DateTimeFormat("pt-BR").format(new Date(item.updated_at)) : "—"}</td>
                        <td className="p-3">
                            <div className="flex justify-end gap-1">
                                <Button type="button" size="icon" variant="outline" title="Excluir DataBook" disabled={pending} onClick={() => setDeleteTarget(item)}><Trash2 className="h-4 w-4" /></Button>
                                <Button size="icon" variant="outline" title="Exportar PDF" asChild><a href={`/api/databooks/${encodeURIComponent(item.id)}/pdf`} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /></a></Button>
                                <Button type="button" size="icon" variant="outline" title="Duplicar DataBook" disabled={pending} onClick={() => duplicate(item)}><Copy className="h-4 w-4" /></Button>
                                <Button size="icon" variant="outline" title="Editar DataBook" asChild><Link href={`/dashboard/databook-documents/${encodeURIComponent(item.id)}`}><Pencil className="h-4 w-4" /></Link></Button>
                            </div>
                        </td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir DataBook?</AlertDialogTitle>
                    <AlertDialogDescription>O DataBook “{deleteTarget?.title}” será removido da listagem. Esta ação respeita o histórico e utiliza exclusão lógica.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={remove} disabled={pending}>Excluir</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    </>;
}
