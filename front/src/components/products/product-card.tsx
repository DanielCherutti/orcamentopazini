"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, ImageIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Product, deleteProductAction } from "@/actions/product-actions";

interface ProductCardProps {
    product: Product;
}

/**
 * Mobile-friendly product card
 * Replaces table on screens < 768px
 */
export function ProductCard({ product }: ProductCardProps) {
    return (
        <Card className="overflow-hidden rounded-xl border-border/80 shadow-sm ring-1 ring-black/[0.02]">
            <CardContent className="space-y-3 p-4 sm:p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    {product.imageUrl ? (
                        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-muted flex-shrink-0">
                            <Image
                                src={product.imageUrl}
                                alt={product.description}
                                fill
                                sizes="48px"
                                className="object-cover"
                                unoptimized
                            />
                        </div>
                    ) : (
                        <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                            <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Código</p>
                        <p className="font-semibold">{product.code}</p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="icon" className="rounded-sm h-8 w-8" asChild>
                            <Link href={`/dashboard/products/${product.id!.includes(":") ? product.id!.split(":")[1] : product.id}`}>
                                <Edit className="h-4 w-4" />
                            </Link>
                        </Button>
                        <form action={async () => { await deleteProductAction(product.id!) }}>
                            <Button
                                variant="outline"
                                size="icon"
                                className="rounded-sm h-8 w-8"
                                type="submit"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </div>

                {/* Description */}
                <div>
                    <p className="text-xs text-muted-foreground">Descrição</p>
                    <p className="text-sm">{product.description}</p>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t sm:grid-cols-4">
                    <div>
                        <p className="text-xs text-muted-foreground">NCM</p>
                        <p className="text-sm font-medium font-mono">{product.ncm || "—"}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Unidade</p>
                        <p className="text-sm font-medium">{product.unit}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Preço Equip.</p>
                        <p className="text-sm font-medium">
                            {product.equipmentPrice.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                            })}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Preço Mont.</p>
                        <p className="text-sm font-medium">
                            {product.assemblyPrice.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                            })}
                        </p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
