"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Edit, Trash2, Layers } from "lucide-react";
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
import { deleteProductGroupAction, type ProductGroup } from "@/actions/product-group-actions";
import { toast } from "@/lib/toast";
import { useRouter } from "next/navigation";

interface ProductGroupsTableProps {
  groups: ProductGroup[];
  productCounts: Record<string, number>;
}

export function ProductGroupsTable({ groups, productCounts }: ProductGroupsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const res = await deleteProductGroupAction(id);
    setDeletingId(null);
    if (res.success) {
      toast.success("Grupo excluído com sucesso");
      router.refresh();
    } else {
      toast.error(res.error ?? "Erro ao excluir grupo");
    }
    setConfirmId(null);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "—";
    try {
      return new Date(dateStr).toLocaleDateString("pt-BR");
    } catch {
      return "—";
    }
  };

  const getGroupId = (group: ProductGroup) => {
    const id = group.id;
    if (id.includes(":")) return id.split(":")[1];
    return id;
  };

  if (groups.length === 0) {
    return (
      <div className="tenant-ops-empty flex flex-col items-center justify-center gap-3 rounded-xl px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[rgb(var(--primary-rgb)/0.15)] text-[color:var(--brand-secondary)]">
          <Layers className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <p className="tenant-ops-text text-sm font-medium">Nenhum grupo ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Crie um grupo para organizar o catálogo e facilitar filtros nos orçamentos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-table overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="h-11 w-16 px-4 text-left">Foto</th>
              <th className="h-11 px-4 text-left">Nome</th>
              <th className="h-11 w-[108px] px-4 text-center">Produtos</th>
              <th className="h-11 w-[128px] px-4 text-left">Criado em</th>
              <th className="h-11 w-[96px] px-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td className="p-4">
                  {group.image_url ? (
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-[rgb(var(--primary-rgb)/0.1)]">
                      <Image
                        src={group.image_url}
                        alt={group.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--primary-rgb)/0.1)]">
                      <Layers className="h-5 w-5 text-[color:rgb(var(--brand-secondary-rgb)/0.8)]" />
                    </div>
                  )}
                </td>
                <td className="p-4 font-medium">{group.name}</td>
                <td className="p-4 text-center text-muted-foreground">
                  {productCounts[group.id] ?? 0}
                </td>
                <td className="p-4 text-muted-foreground">{formatDate(group.created_at)}</td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" asChild>
                      <Link href={`/dashboard/products/groups/${encodeURIComponent(getGroupId(group))}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                      onClick={() => setConfirmId(group.id)}
                      disabled={deletingId === group.id}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={confirmId !== null} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir grupo</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {(() => {
                  const group = confirmId ? groups.find((g) => g.id === confirmId) : null;
                  const count = confirmId ? (productCounts[confirmId] ?? 0) : 0;
                  return (
                    <>
                      <p>
                        Tem certeza que deseja excluir o grupo{" "}
                        <span className="font-semibold text-foreground">{group?.name}</span>?
                      </p>
                      {count > 0 && (
                        <p className="text-amber-600">
                          {count} produto{count !== 1 ? "s" : ""} vinculado{count !== 1 ? "s" : ""} será{count !== 1 ? "ão" : ""} desvinculado{count !== 1 ? "s" : ""}, mas não excluído{count !== 1 ? "s" : ""}.
                        </p>
                      )}
                      <p>Esta ação não pode ser desfeita.</p>
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmId && handleDelete(confirmId)}
              disabled={deletingId !== null}
            >
              {deletingId ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
