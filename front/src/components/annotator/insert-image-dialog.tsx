/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useDebouncedCallback } from "use-debounce";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Upload, X, Loader2, ImageIcon } from "lucide-react";
import { getProductsAction, type Product } from "@/actions/product-actions";
import {
    getLibraryImagesAction,
    createLibraryImageAction,
    deleteLibraryImageAction,
    type LibraryImage,
} from "@/actions/image-library-actions";
import { toast } from "@/lib/toast";

interface InsertImageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectImage: (imageUrl: string, label: string) => void;
}

export function InsertImageDialog({
    open,
    onOpenChange,
    onSelectImage,
}: InsertImageDialogProps) {
    const [tab, setTab] = useState<string>("products");

    // Products tab state
    const [productQuery, setProductQuery] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    // Library tab state
    const [libraryQuery, setLibraryQuery] = useState("");
    const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
    const [loadingLibrary, setLoadingLibrary] = useState(false);
    const [uploading, setUploading] = useState(false);
    /** Nome exibido no quadro (obrigatório antes de escolher a figura). */
    const [insertImageName, setInsertImageName] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);
    const canPickImage = insertImageName.trim().length > 0;

    useEffect(() => {
        if (open) {
            setInsertImageName("");
        }
    }, [open]);

    // Fetch products with debounce
    const fetchProducts = useDebouncedCallback(async (query: string) => {
        setLoadingProducts(true);
        try {
            const result = await getProductsAction({ query, limit: 50 });
            if (result.success && result.data) {
                // Only show products with images
                setProducts(result.data.filter((p) => p.imageUrl));
            }
        } catch {
            console.error("Error fetching products");
        } finally {
            setLoadingProducts(false);
        }
    }, 300);

    // Fetch library images with debounce
    const fetchLibrary = useDebouncedCallback(async (query: string) => {
        setLoadingLibrary(true);
        try {
            const result = await getLibraryImagesAction({ query, limit: 50 });
            if (result.success && result.data) {
                setLibraryImages(result.data);
            }
        } catch {
            console.error("Error fetching library images");
        } finally {
            setLoadingLibrary(false);
        }
    }, 300);

    // Load data when dialog opens or tab changes
    useEffect(() => {
        if (!open) return;
        if (tab === "products") {
            fetchProducts("");
        } else {
            fetchLibrary("");
        }
        // Intentionally only trigger on open/tab change, not on query changes
        // (queries are handled by their respective search handlers)
    }, [open, tab, fetchProducts, fetchLibrary]);

    const handleProductSearch = (value: string) => {
        setProductQuery(value);
        fetchProducts(value);
    };

    const handleLibrarySearch = (value: string) => {
        setLibraryQuery(value);
        fetchLibrary(value);
    };

    const resolveInsertName = (): string | null => {
        const name = insertImageName.trim();
        if (!name) {
            toast.error("Informe o nome da figura no campo acima.");
            return null;
        }
        return name;
    };

    const handleSelectProduct = (product: Product) => {
        if (!product.imageUrl) return;
        const name = resolveInsertName();
        if (!name) return;
        onSelectImage(product.imageUrl, name);
        onOpenChange(false);
    };

    const handleSelectLibraryImage = (image: LibraryImage) => {
        const name = resolveInsertName();
        if (!name) return;
        onSelectImage(image.url, name);
        onOpenChange(false);
    };

    const handleUpload = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Arquivo deve ser uma imagem");
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Arquivo excede o limite de 5MB");
            return;
        }

        setUploading(true);
        try {
            // Upload file
            const formData = new FormData();
            formData.append("file", file);
            const response = await fetch("/api/upload/library", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("Upload failed");
            }

            const { url } = await response.json();

            // Get image dimensions
            const dimensions = await getImageDimensions(url);

            // Create DB record
            const name = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
            const result = await createLibraryImageAction({
                name,
                url,
                width: dimensions.width,
                height: dimensions.height,
            });

            if (result.success && result.data) {
                setLibraryImages((prev) => [result.data!, ...prev]);
                toast.success("Imagem adicionada");
            } else {
                toast.error(result.error || "Erro ao salvar imagem");
            }
        } catch {
            toast.error("Erro ao fazer upload");
        } finally {
            setUploading(false);
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            handleUpload(file);
        }
        // Reset so same file can be selected again
        e.target.value = "";
    };

    const handleDeleteLibraryImage = async (e: React.MouseEvent, image: LibraryImage) => {
        e.stopPropagation();
        try {
            const result = await deleteLibraryImageAction(image.id);
            if (result.success) {
                setLibraryImages((prev) => prev.filter((i) => i.id !== image.id));
            } else {
                toast.error(result.error || "Erro ao excluir");
            }
        } catch {
            toast.error("Erro ao excluir imagem");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden gap-3 p-6">
                <DialogDescription className="sr-only">
                    Informe o nome da figura, depois escolha um produto ou um item da biblioteca.
                </DialogDescription>
                <DialogHeader className="shrink-0 space-y-1 text-left">
                    <DialogTitle>Inserir figura</DialogTitle>
                </DialogHeader>

                <div className="space-y-2 shrink-0 rounded-md border bg-muted/30 p-3">
                    <Label htmlFor="insert-image-name" className="text-foreground">
                        Nome da figura <span className="text-destructive">*</span>
                    </Label>
                    <Input
                        id="insert-image-name"
                        value={insertImageName}
                        onChange={(e) => setInsertImageName(e.target.value)}
                        placeholder="Obrigatório — ex.: acabamento, referência…"
                        maxLength={200}
                        autoComplete="off"
                        autoFocus
                    />
                    <p className="text-xs text-muted-foreground">
                        Preencha aqui e, em seguida, clique na miniatura abaixo.
                    </p>
                </div>

                <Tabs
                    value={tab}
                    onValueChange={setTab}
                    className="flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="products">Produtos</TabsTrigger>
                        <TabsTrigger value="library">Biblioteca</TabsTrigger>
                    </TabsList>

                    {/* Products Tab */}
                    <TabsContent value="products" className="flex-1 flex flex-col min-h-0 mt-4">
                        <div className="relative mb-3">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nome ou código..."
                                value={productQuery}
                                onChange={(e) => handleProductSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "400px" }}>
                            {loadingProducts ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                    <ImageIcon className="h-8 w-8 mb-2" />
                                    <p className="text-sm">Nenhum produto com imagem encontrado</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 p-1">
                                    {products.map((product) => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            disabled={!canPickImage}
                                            title={!canPickImage ? "Preencha o nome da figura acima" : undefined}
                                            onClick={() => handleSelectProduct(product)}
                                            className="flex flex-col items-center gap-1 p-2 rounded-md border hover:bg-accent hover:border-primary/50 transition-colors cursor-pointer group disabled:pointer-events-none disabled:opacity-40"
                                        >
                                            <div className="w-full aspect-square rounded bg-muted overflow-hidden">
                                                <img
                                                    src={product.imageUrl}
                                                    alt={product.description}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <span className="text-[10px] text-center truncate w-full text-muted-foreground group-hover:text-foreground">
                                                {product.description}
                                            </span>
                                            {product.code && (
                                                <span className="text-[9px] font-mono text-muted-foreground truncate w-full text-center">
                                                    {product.code}
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>

                    {/* Library Tab */}
                    <TabsContent value="library" className="flex-1 flex flex-col min-h-0 mt-4">
                        <div className="flex gap-2 mb-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar imagem..."
                                    value={libraryQuery}
                                    onChange={(e) => handleLibrarySearch(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={uploading}
                                className="shrink-0"
                            >
                                {uploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Upload className="h-4 w-4" />
                                )}
                                <span className="ml-1">Upload</span>
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </div>
                        <ScrollArea className="flex-1 min-h-0" style={{ maxHeight: "400px" }}>
                            {loadingLibrary ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : libraryImages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                    <ImageIcon className="h-8 w-8 mb-2" />
                                    <p className="text-sm">
                                        {libraryQuery
                                            ? "Nenhuma imagem encontrada"
                                            : "Biblioteca vazia. Faça upload de imagens."}
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-2 p-1">
                                    {libraryImages.map((image) => (
                                        <button
                                            key={image.id}
                                            type="button"
                                            title={!canPickImage ? "Preencha o nome da figura acima" : undefined}
                                            onClick={() => {
                                                if (!canPickImage) {
                                                    toast.error("Informe o nome da figura no campo acima.");
                                                    return;
                                                }
                                                handleSelectLibraryImage(image);
                                            }}
                                            className={
                                                "relative flex flex-col items-center gap-1 p-2 rounded-md border hover:bg-accent hover:border-primary/50 transition-colors cursor-pointer group " +
                                                (!canPickImage ? "opacity-50" : "")
                                            }
                                        >
                                            <div className="w-full aspect-square rounded bg-muted overflow-hidden">
                                                <img
                                                    src={image.url}
                                                    alt={image.name}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <span className="text-[10px] text-center truncate w-full text-muted-foreground group-hover:text-foreground">
                                                {image.name}
                                            </span>
                                            {/* Delete button */}
                                            <button
                                                type="button"
                                                onClick={(e) => handleDeleteLibraryImage(e, image)}
                                                className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Excluir"
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

/** Helper to get image dimensions from a URL */
function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
    });
}
