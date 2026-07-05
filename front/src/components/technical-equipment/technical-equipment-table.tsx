"use client";

import Link from "next/link";
import { Edit, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTechnicalEquipmentCategoryLabel } from "@/lib/technical-equipment/categories";
import type { TechnicalEquipment } from "@/types/technical-equipment-types";

interface TechnicalEquipmentTableProps {
    initialItems: TechnicalEquipment[];
    initialMeta: { total: number; page: number; limit: number; totalPages: number };
    query: string;
}

export function TechnicalEquipmentTable({
    initialItems,
    initialMeta,
    query,
}: TechnicalEquipmentTableProps) {
    if (initialItems.length === 0) {
        return (
            <p className="text-sm text-muted-foreground py-8 text-center">
                {query ? "Nenhum equipamento encontrado." : "Nenhum equipamento cadastrado."}
            </p>
        );
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                {initialMeta.total} equipamento(s)
            </p>
            <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left p-3 font-medium">Código</th>
                            <th className="text-left p-3 font-medium">Descrição</th>
                            <th className="text-left p-3 font-medium hidden md:table-cell">Fabricante</th>
                            <th className="text-left p-3 font-medium hidden lg:table-cell">Categoria</th>
                            <th className="text-center p-3 font-medium">Manual</th>
                            <th className="p-3 w-12" />
                        </tr>
                    </thead>
                    <tbody>
                        {initialItems.map((item) => (
                            <tr key={item.id} className="border-t hover:bg-muted/30">
                                <td className="p-3 font-mono text-xs">{item.code}</td>
                                <td className="p-3">{item.description}</td>
                                <td className="p-3 hidden md:table-cell text-muted-foreground">
                                    {item.manufacturer} {item.model}
                                </td>
                                <td className="p-3 hidden lg:table-cell text-muted-foreground">
                                    {getTechnicalEquipmentCategoryLabel(item.category)}
                                </td>
                                <td className="p-3 text-center">
                                    {item.manual_file ? (
                                        <FileText className="h-4 w-4 inline text-green-600" />
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <Button variant="ghost" size="icon" asChild>
                                        <Link
                                            href={`/dashboard/technical-equipment/${encodeURIComponent(item.id!)}`}
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Link>
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
