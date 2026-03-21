
"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Product } from "@/actions/product-actions";
import { useFormStatus } from "react-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { ImageUpload } from "@/components/products/image-upload";
import { AttachmentManager, Attachment } from "@/components/products/attachment-manager";
import { AlertCircle, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
} from "@/components/ui/alert-dialog"

import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { ProductGroupSelector } from "@/components/products/product-group-selector";
import { ProductUnitSelector } from "@/components/products/product-unit-selector";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

function SubmitButton({ isEditing }: { isEditing: boolean }) {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} className="min-w-[140px]">
            {pending ? (
                <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Salvando...
                </>
            ) : (
                isEditing ? "Salvar Alterações" : "Salvar Produto"
            )}
        </Button>
    );
}

interface ProductFormProps {
    initialData?: Product;
    defaultCode?: string;
    action: (formData: FormData) => Promise<void>;
    errors?: Record<string, string[] | undefined>;
    generalError?: string;
    onDelete?: () => Promise<void>;
}

const formatPrice = (value: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2 }).format(value);

export function ProductForm({ initialData, defaultCode, action, errors, generalError, onDelete }: ProductFormProps) {
    const [code, setCode] = useState(initialData?.code || defaultCode || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [unit, setUnit] = useState(initialData?.unit || "");
    const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || "");
    const [attachments, setAttachments] = useState<Attachment[]>(initialData?.attachments || []);
    const [groupIds, setGroupIds] = useState<string[]>(initialData?.group_ids || []);
    const [detailedDescription, setDetailedDescription] = useState(initialData?.detailedDescription || "");
    const [equipPrice, setEquipPrice] = useState(
        initialData?.equipmentPrice != null ? formatPrice(initialData.equipmentPrice) : ""
    );
    const [assemblyPrice, setAssemblyPrice] = useState(
        initialData?.assemblyPrice != null ? formatPrice(initialData.assemblyPrice) : ""
    );
    const [assemblyPriceType, setAssemblyPriceType] = useState<"fixed" | "percentage">(
        initialData?.assemblyPriceType || "fixed"
    );
    const [assemblyPricePercentage, setAssemblyPricePercentage] = useState(
        initialData?.assemblyPricePercentage != null ? String(initialData.assemblyPricePercentage) : ""
    );
    // Sync defaultCode when it arrives asynchronously (new product page)
    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    useEffect(() => {
        if (defaultCode && !initialData?.id && !code) setCode(defaultCode);
    }, [defaultCode]);
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

    // Radix Tabs gera IDs diferentes em server vs client (useId) - renderizar só no cliente
    const emptySubscribe = () => () => {};
    const tabsMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

    // Sync state when navigating between products (productId changes without unmounting).
    // Intentionally depends only on productId to avoid overwriting local edits on revalidation.
    const productId = initialData?.id;
    /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
    useEffect(() => {
        if (!initialData || !productId) return;
        setCode(initialData.code || "");
        setDescription(initialData.description || "");
        setUnit(initialData.unit || "");
        setImageUrl(initialData.imageUrl || "");
        setAttachments(initialData.attachments || []);
        setGroupIds(initialData.group_ids || []);
        setDetailedDescription(initialData.detailedDescription || "");
        setEquipPrice(
            initialData.equipmentPrice != null
                ? formatPrice(initialData.equipmentPrice)
                : ""
        );
        setAssemblyPrice(
            initialData.assemblyPrice != null
                ? formatPrice(initialData.assemblyPrice)
                : ""
        );
        setAssemblyPriceType(initialData.assemblyPriceType || "fixed");
        setAssemblyPricePercentage(
            initialData.assemblyPricePercentage != null
                ? String(initialData.assemblyPricePercentage)
                : ""
        );
    }, [productId]);
    /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

    const handlePriceChange = (value: string, setter: (v: string) => void) => {
        const digits = value.replace(/\D/g, "");
        const numberValue = Number(digits) / 100;
        setter(formatPrice(numberValue));
    };

    const getError = (field: string) => errors?.[field]?.[0];

    // Radix Tabs desmonta abas inativas, removendo inputs do DOM.
    // Garantir TODOS os valores do state no FormData independente da aba ativa.
    // Compute assembly price from percentage when type is "percentage"
    const parsePriceValue = (formatted: string) => {
        if (!formatted) return 0;
        const clean = formatted.replace(/\./g, "").replace(",", ".");
        return parseFloat(clean) || 0;
    };

    const equipPriceNumber = parsePriceValue(equipPrice);
    const percentageNumber = parseFloat(assemblyPricePercentage) || 0;
    const calculatedAssemblyPrice = assemblyPriceType === "percentage"
        ? equipPriceNumber * percentageNumber / 100
        : parsePriceValue(assemblyPrice);

    const handleFormAction = async (formData: FormData) => {
        formData.set("code", code);
        formData.set("description", description);
        formData.set("unit", unit);
        formData.set("equipmentPrice", equipPrice);
        formData.set("assemblyPrice", assemblyPriceType === "percentage"
            ? formatPrice(calculatedAssemblyPrice)
            : (assemblyPrice || formatPrice(0)));
        formData.set("assemblyPriceType", assemblyPriceType);
        if (assemblyPriceType === "percentage") {
            formData.set("assemblyPricePercentage", String(percentageNumber));
        }
        formData.set("imageUrl", imageUrl);
        formData.set("detailedDescription", detailedDescription);
        formData.set("attachments", JSON.stringify(attachments));
        formData.set("group_ids", JSON.stringify(groupIds));
        await action(formData);
    };

    return (
        <form action={handleFormAction} className="space-y-6">
            {generalError && (
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Erro</AlertTitle>
                    <AlertDescription>{generalError}</AlertDescription>
                </Alert>
            )}

            {/* Hidden inputs for complex state */}
            <input type="hidden" name="imageUrl" value={imageUrl} />
            <input type="hidden" name="attachments" value={JSON.stringify(attachments)} />
            <input type="hidden" name="detailedDescription" value={detailedDescription} />
            <input type="hidden" name="group_ids" value={JSON.stringify(groupIds)} />

            {tabsMounted ? (
                <Tabs defaultValue="basic" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="basic">Básico</TabsTrigger>
                        <TabsTrigger value="description">Descrição Detalhada</TabsTrigger>
                        <TabsTrigger value="attachments">Anexos</TabsTrigger>
                    </TabsList>

                    <TabsContent value="basic">
                    <Card>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="code" className={getError("code") ? "text-red-500" : ""}>Código *</Label>
                                    <Input id="code" name="code" value={code} onChange={(e) => setCode(e.target.value)} required className={getError("code") ? "border-red-500" : ""} />
                                    {getError("code") && <p className="text-sm text-red-500">{getError("code")}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="unit" className={getError("unit") ? "text-red-500" : ""}>Unidade *</Label>
                                    <ProductUnitSelector value={unit} onChange={setUnit} />
                                    {getError("unit") && <p className="text-sm text-red-500">{getError("unit")}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className={getError("description") ? "text-red-500" : ""}>Descrição *</Label>
                                <Input id="description" name="description" value={description} onChange={(e) => setDescription(e.target.value)} required className={getError("description") ? "border-red-500" : ""} />
                                {getError("description") && <p className="text-sm text-red-500">{getError("description")}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="group">Grupos</Label>
                                <ProductGroupSelector value={groupIds} onChange={setGroupIds} />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="equipmentPrice" className={getError("equipmentPrice") ? "text-red-500" : ""}>Preço Equipamento (R$) *</Label>
                                    <Input
                                        id="equipmentPrice"
                                        name="equipmentPrice"
                                        type="text"
                                        value={equipPrice}
                                        onChange={(e) => handlePriceChange(e.target.value, setEquipPrice)}
                                        placeholder="0,00"
                                        required
                                        className={getError("equipmentPrice") ? "border-red-500" : ""}
                                    />
                                    {getError("equipmentPrice") && <p className="text-sm text-red-500">{getError("equipmentPrice")}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="assemblyPrice" className={getError("assemblyPrice") ? "text-red-500" : ""}>Preço Montagem</Label>
                                    <div className="flex gap-2">
                                        <Select value={assemblyPriceType} onValueChange={(v: "fixed" | "percentage") => setAssemblyPriceType(v)}>
                                            <SelectTrigger className="w-[100px] shrink-0">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="fixed">R$</SelectItem>
                                                <SelectItem value="percentage">%</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        {assemblyPriceType === "fixed" ? (
                                            <Input
                                                id="assemblyPrice"
                                                name="assemblyPrice"
                                                type="text"
                                                value={assemblyPrice}
                                                onChange={(e) => handlePriceChange(e.target.value, setAssemblyPrice)}
                                                placeholder="0,00"
                                                className={getError("assemblyPrice") ? "border-red-500" : ""}
                                            />
                                        ) : (
                                            <Input
                                                id="assemblyPricePercentage"
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                max="100"
                                                value={assemblyPricePercentage}
                                                onChange={(e) => setAssemblyPricePercentage(e.target.value)}
                                                placeholder="0"
                                                className={getError("assemblyPrice") ? "border-red-500" : ""}
                                            />
                                        )}
                                    </div>
                                    {assemblyPriceType === "percentage" && equipPriceNumber > 0 && percentageNumber > 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            Valor calculado: R$ {formatPrice(calculatedAssemblyPrice)}
                                        </p>
                                    )}
                                    {getError("assemblyPrice") && <p className="text-sm text-red-500">{getError("assemblyPrice")}</p>}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Imagem de Capa</Label>
                                <div className="border p-4 rounded-md">
                                    <ImageUpload
                                        productId={initialData?.id}
                                        initialUrl={imageUrl}
                                        onImageUploaded={(url) => setImageUrl(url)}
                                        onImageRemoved={() => setImageUrl("")}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="description">
                    <Card>
                        <CardContent className="pt-6">
                            <RichTextEditor
                                value={detailedDescription}
                                onChange={setDetailedDescription}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="attachments">
                    <Card>
                        <CardContent className="pt-6">
                            <AttachmentManager
                                productId={initialData?.id}
                                attachments={attachments}
                                onAttachmentsChange={setAttachments}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
            ) : (
                <div className="w-full space-y-4">
                    <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground w-full max-w-md">
                        <span className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium">Básico</span>
                    </div>
                    <Card>
                        <CardContent className="space-y-4 pt-6 animate-pulse">
                            <div className="h-10 bg-muted rounded" />
                            <div className="h-10 bg-muted rounded" />
                            <div className="h-24 bg-muted rounded" />
                        </CardContent>
                    </Card>
                </div>
            )}

            <div className="flex justify-between items-center">
                {initialData?.id && onDelete ? (
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" type="button">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir Produto
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta ação não pode ser desfeita. Isso excluirá permanentemente o produto e seus arquivos associados.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">
                                    Sim, Excluir
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                ) : (
                    <div></div>
                )}

                <div className="flex gap-4">
                    <Button variant="outline" type="button" onClick={() => window.history.back()}>Cancelar</Button>
                    <SubmitButton isEditing={!!initialData?.id} />
                </div>
            </div>
        </form>
    );
}
