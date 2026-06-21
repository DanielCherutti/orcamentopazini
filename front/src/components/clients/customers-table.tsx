"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
    listCustomersAction,
    deleteCustomerAction,
    type CustomerFull,
} from "@/actions/client-actions";
import { Edit, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/lib/toast";

interface CustomersTableProps {
    initialCustomers: CustomerFull[];
    initialMeta: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export function CustomersTable({ initialCustomers, initialMeta }: CustomersTableProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const [customers, setCustomers] = useState(initialCustomers);
    const [meta, setMeta] = useState(initialMeta);
    const [isLoading, setIsLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const isFirstRender = useRef(true);

    const query = searchParams.get("query") || "";
    const page = Number(searchParams.get("page")) || 1;
    const limit = Number(searchParams.get("limit")) || 10;
    const sortBy = searchParams.get("sortBy") || "name";
    const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "asc";

    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }

        const fetchCustomers = async () => {
            setIsLoading(true);
            const result = await listCustomersAction({ page, query, limit, sortBy, sortOrder });
            if (result.success && result.data && result.meta) {
                setCustomers(result.data);
                setMeta(result.meta);
            }
            setIsLoading(false);
        };

        fetchCustomers();
    }, [page, limit, query, sortBy, sortOrder]);

    const handlePageChange = (newPage: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", newPage.toString());
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleLimitChange = (newLimit: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("limit", newLimit);
        params.set("page", "1");
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const handleSort = (column: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (sortBy === column) {
            params.set("sortOrder", sortOrder === "asc" ? "desc" : "asc");
        } else {
            params.set("sortBy", column);
            params.set("sortOrder", "asc");
        }
        params.set("page", "1");
        startTransition(() => {
            router.push(`?${params.toString()}`, { scroll: false });
        });
    };

    const getSortIcon = (column: string) => {
        if (sortBy !== column) {
            return <ArrowUpDown className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-50 transition-opacity" />;
        }
        return sortOrder === "asc"
            ? <ArrowUp className="h-3 w-3 ml-1" />
            : <ArrowDown className="h-3 w-3 ml-1" />;
    };

    const handleDelete = async (id: string) => {
        setDeletingId(id);
        const res = await deleteCustomerAction(id);
        setDeletingId(null);
        if (res.success) {
            toast.success("Cliente excluído com sucesso!");
            router.refresh();
        } else {
            toast.error(res.error || "Erro ao excluir cliente");
        }
    };

    const getCustomerIdForUrl = (id: string) => {
        return id.includes(":") ? id.split(":")[1] : id;
    };

    const total = meta?.total ?? 0;
    const totalPages = meta?.totalPages ?? 1;
    const currentPage = meta?.page ?? 1;

    return (
        <>
            {/* Loading overlay */}
            {(isLoading || isPending) && (
                <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Carregando...
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="app-table overflow-hidden rounded-md">
                <table className="w-full text-sm">
                    <thead>
                        <tr>
                            <th
                                className="group h-10 cursor-pointer px-4 text-left transition-colors hover:bg-[rgb(var(--primary-rgb)/0.08)]"
                                onClick={() => handleSort("name")}
                            >
                                <div className="flex items-center">
                                    Nome
                                    {getSortIcon("name")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[160px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("cnpj")}
                            >
                                <div className="flex items-center">
                                    CNPJ
                                    {getSortIcon("cnpj")}
                                </div>
                            </th>
                            <th
                                className="h-10 px-4 text-left font-medium text-muted-foreground w-[160px] cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => handleSort("city")}
                            >
                                <div className="flex items-center">
                                    Cidade/UF
                                    {getSortIcon("city")}
                                </div>
                            </th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[150px]">
                                Telefone
                            </th>
                            <th className="h-10 px-4 text-left font-medium text-muted-foreground w-[200px]">
                                E-mail
                            </th>
                            <th className="h-10 px-4 text-right font-medium text-muted-foreground w-[100px]">
                                Ações
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers && customers.length > 0 ? (
                            customers.map((customer) => {
                                const cityUF = customer.address?.city && customer.address?.state
                                    ? `${customer.address.city}/${customer.address.state}`
                                    : customer.address?.city || customer.city || "—";
                                const urlId = getCustomerIdForUrl(customer.id);
                                return (
                                    <tr
                                        key={customer.id}
                                        className="border-b border-border hover:bg-muted/20 transition-colors"
                                    >
                                        <td className="p-4 font-medium">{customer.name}</td>
                                        <td className="p-4 text-muted-foreground">{customer.cnpj || "—"}</td>
                                        <td className="p-4 text-muted-foreground">{cityUF}</td>
                                        <td className="p-4 text-muted-foreground">{customer.phone || "—"}</td>
                                        <td className="p-4 text-muted-foreground truncate max-w-[200px]">
                                            {customer.email || "—"}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="rounded-sm h-8 w-8"
                                                    asChild
                                                >
                                                    <Link href={`/customers/${urlId}/edit`}>
                                                        <Edit className="h-4 w-4" />
                                                    </Link>
                                                </Button>
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button
                                                            variant="outline"
                                                            size="icon"
                                                            className="rounded-sm h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                            disabled={deletingId === customer.id}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                Tem certeza que deseja excluir <strong>{customer.name}</strong>? Esta ação não pode ser desfeita.
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                            <AlertDialogAction
                                                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                onClick={() => handleDelete(customer.id)}
                                                            >
                                                                Excluir
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        ) : (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                    {query
                                        ? `Nenhum cliente encontrado para "${query}"`
                                        : "Nenhum cliente cadastrado"}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {customers && customers.length > 0 && (
                <div className="flex flex-col gap-4 pt-4 border-t border-border">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <p className="text-sm text-muted-foreground font-medium">
                            Mostrando {(currentPage - 1) * limit + 1}–{Math.min(currentPage * limit, total)} de {total} clientes
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">Itens por página:</span>
                            <select
                                value={limit}
                                onChange={(e) => handleLimitChange(e.target.value)}
                                className="h-9 rounded-sm border border-input bg-background px-3 text-sm"
                                disabled={isLoading || isPending}
                            >
                                <option value="10">10</option>
                                <option value="20">20</option>
                                <option value="50">50</option>
                                <option value="100">100</option>
                            </select>
                        </div>
                    </div>

                    {totalPages > 1 && (
                        <div className="flex flex-col sm:flex-row items-center gap-4">
                            <div className="text-sm text-muted-foreground font-medium">
                                Página {currentPage} de {totalPages}
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    title="Primeira página"
                                >
                                    ««
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage - 1)}
                                    disabled={currentPage === 1 || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    title="Página anterior"
                                >
                                    ‹ <span className="hidden sm:inline ml-1">Anterior</span>
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(currentPage + 1)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 px-3"
                                    title="Próxima página"
                                >
                                    <span className="hidden sm:inline mr-1">Próximo</span> ›
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePageChange(totalPages)}
                                    disabled={currentPage === totalPages || isLoading || isPending}
                                    className="rounded-sm h-9 w-9 p-0"
                                    title="Última página"
                                >
                                    »»
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
}
