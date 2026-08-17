"use client";

import { useEffect, useState, useTransition } from "react";
import {
    addProductToDatabookInstallationAction,
    createDatabookInstallationAction,
    listDatabookInstallationsAction,
    reorderDatabookInstallationProductsAction,
    updateDatabookInstallationAction,
    updateDatabookProductValuesAction,
} from "@/actions/databook-content-actions";
import { getProductAction, getProductsAction, updateProductAction, type Product } from "@/actions/product-actions";
import { getProductDatabookConfigAction, listProductManualsAction } from "@/actions/product-databook-actions";
import { hierarchicalInstallationNumber } from "@/lib/databooks/domain";
import { toast } from "@/lib/toast";
import type { DatabookInstallation, DatabookInstallationProduct } from "@/types/databook-types";
import type { DatabookMedia } from "@/types/databook-types";
import { createDatabookMediaAction, deleteDatabookMediaAction } from "@/actions/databook-media-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Eye, ImagePlus, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProductForm } from "@/components/products/product-form";
import { ProductDatabookPanel } from "@/components/products/product-databook-panel";
import type { ProductDatabookConfig } from "@/actions/product-databook-actions";
import type { ProductManual } from "@/types/databook-types";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";

const FIELD_LABELS: Record<string, string> = {
    installation_number: "Número da instalação",
    seal_number: "Número do lacre",
    serial_number: "Número de série",
    manufacture_year: "Ano de fabricação",
    users: "Número de usuários",
    fixing_method: "Método de fixação",
    traction_test: "Ensaio de tração",
    fit_for_use: "Apto para uso",
    max_deflection: "Deflexão máxima do cabo (m)",
    absorbers: "Número de absorvedores",
};

export function DatabookInstallationsEditor({
    databookId,
    initialInstallations,
    initialMedia,
}: {
    databookId: string;
    initialInstallations: DatabookInstallation[];
    initialMedia: DatabookMedia[];
}) {
    const [installations, setInstallations] = useState(initialInstallations);
    const [products, setProducts] = useState<Product[]>([]);
    const [media, setMedia] = useState(initialMedia);
    const [name, setName] = useState("");
    const [selectedInstallationId, setSelectedInstallationId] = useState<string | null>(null);
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [productDialogOpen, setProductDialogOpen] = useState(false);
    const [productSearch, setProductSearch] = useState("");
    const [imageQueue, setImageQueue] = useState<Array<{ installationId: string; file: File }>>([]);
    const [imageCaption, setImageCaption] = useState("");
    const [imageUploading, setImageUploading] = useState(false);
    const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
    const confirmDialog = useConfirmDialog();
    const [openProducts, setOpenProducts] = useState<Set<string>>(new Set());
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        void getProductsAction({ limit: 10000, sortBy: "description", sortOrder: "asc" }).then((result) => {
            if (result.success) setProducts(result.data ?? []);
        });
    }, []);

    const addInstallation = () => startTransition(async () => {
        const result = await createDatabookInstallationAction(databookId, { name });
        if (!result.success || !result.id) {
            toast.error(result.error ?? "Erro ao incluir instalação");
            return;
        }
        setInstallations((current) => [...current, {
            id: result.id!,
            databook_id: databookId,
            name,
            position: current.length,
            products: [],
        }]);
        setSelectedInstallationId(result.id!);
        setCreateDialogOpen(false);
        setName("");
        toast.success("Instalação incluída");
    });

    const addProduct = (installation: DatabookInstallation, productId: string) => startTransition(async () => {
        if (!productId) return;
        const result = await addProductToDatabookInstallationAction(databookId, installation.id, productId);
        if (!result.success) {
            toast.error(result.error ?? "Erro ao incluir produto");
            return;
        }
        const refreshed = await listDatabookInstallationsAction(databookId);
        if (refreshed.success) setInstallations(refreshed.data);
        toast.success("Produto adicionado à instalação");
    });

    const uploadInstallationImage = async (installationId: string, file: File, caption: string): Promise<boolean> => {
        const form = new FormData();
        form.set("file", file);
        const response = await fetch(`/api/upload/databook/${encodeURIComponent(databookId)}/media`, { method: "POST", body: form });
        const uploaded = await response.json() as { url?: string; filename?: string; type?: string; error?: string };
        if (!response.ok || !uploaded.url) {
            toast.error(uploaded.error ?? "Erro no upload");
            return false;
        }
        const result = await createDatabookMediaAction(databookId, {
            installation_id: installationId,
            file_url: uploaded.url,
            filename: uploaded.filename ?? file.name,
            mime_type: uploaded.type?.startsWith("image/") ? uploaded.type : "image/jpeg",
            caption,
            alt_text: caption,
            category: "installation",
            include_in_figure_list: true,
        });
        if (!result.success || !result.id) {
            toast.error(result.error ?? "Erro ao registrar imagem");
            return false;
        }
        setMedia((current) => [...current, {
            id: result.id!,
            databook_id: databookId,
            installation_id: installationId,
            file_url: uploaded.url!,
            filename: uploaded.filename ?? file.name,
            mime_type: uploaded.type ?? "image/jpeg",
            caption,
            include_in_figure_list: true,
            position: current.length,
        }]);
        toast.success("Figura incluída");
        return true;
    };

    const queueInstallationImages = (installationId: string, files: File[]) => {
        if (files.length === 0) return;
        if (imageQueue.length === 0) setImageCaption(files[0].name.replace(/\.[^.]+$/, ""));
        setImageQueue((current) => [...current, ...files.map((file) => ({ installationId, file }))]);
    };

    const advanceImageQueue = () => {
        const next = imageQueue.slice(1);
        setImageQueue(next);
        setImageCaption(next[0]?.file.name.replace(/\.[^.]+$/, "") ?? "");
    };

    const confirmInstallationImage = async () => {
        const active = imageQueue[0];
        if (!active) return;
        setImageUploading(true);
        const success = await uploadInstallationImage(active.installationId, active.file, imageCaption.trim());
        setImageUploading(false);
        if (success) advanceImageQueue();
    };

    const removeInstallationImage = async (item: DatabookMedia) => {
        const confirmed = await confirmDialog({
            title: "Excluir foto da instalação",
            description: `Deseja excluir “${item.caption || item.filename}”? Ela também será removida da lista de figuras e da próxima versão do PDF.`,
            confirmLabel: "Excluir foto",
            destructive: true,
        });
        if (!confirmed) return;
        setDeletingMediaId(item.id);
        const result = await deleteDatabookMediaAction(databookId, item.id);
        setDeletingMediaId(null);
        if (!result.success) {
            toast.error(result.error ?? "Erro ao excluir foto");
            return;
        }
        setMedia((current) => current.filter((mediaItem) => mediaItem.id !== item.id));
        toast.success("Foto excluída");
    };

    const toggleProduct = (id: string) => setOpenProducts((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });

    const moveProduct = (installationId: string, itemIndex: number, direction: -1 | 1) => {
        const installation = installations.find((item) => item.id === installationId);
        if (!installation) return;
        const targetIndex = itemIndex + direction;
        if (targetIndex < 0 || targetIndex >= installation.products.length) return;
        const reordered = [...installation.products];
        [reordered[itemIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[itemIndex]];
        setInstallations((current) => current.map((item) => item.id === installationId
            ? { ...item, products: reordered.map((product, position) => ({ ...product, position })) }
            : item));
        startTransition(async () => {
            const result = await reorderDatabookInstallationProductsAction(databookId, installationId, reordered.map((item) => item.id));
            if (!result.success) {
                toast.error(result.error ?? "Erro ao ordenar produtos");
                setInstallations((current) => current.map((item) => item.id === installationId ? installation : item));
            }
        });
    };

    const selectedInstallation = installations.find((item) => item.id === selectedInstallationId);
    const selectedIndex = selectedInstallation ? installations.findIndex((item) => item.id === selectedInstallation.id) : -1;
    const selectedMedia = selectedInstallation ? media.filter((item) => item.installation_id === selectedInstallation.id) : [];
    const normalizedSearch = productSearch.trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
    const filteredProducts = normalizedSearch
        ? products.filter((product) => JSON.stringify(product).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").includes(normalizedSearch))
        : products;

    return (
        <div className="space-y-4">
            {!selectedInstallation ? <>
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold">Instalações e produtos</h1>
                        <p className="text-sm text-muted-foreground">Organize os itens instalados, dados técnicos e figuras do laudo.</p>
                    </div>
                    <Button type="button" onClick={() => setCreateDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar instalação</Button>
                </div>
                {installations.length === 0 ? <div className="rounded-xl border border-dashed bg-card p-10 text-center"><Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhuma instalação cadastrada</p><p className="mt-1 text-sm text-muted-foreground">Adicione a primeira instalação para começar a montar o laudo.</p></div> : null}
                <div className="grid gap-3">
                    {installations.map((installation, installationIndex) => {
                        const installationMedia = media.filter((item) => item.installation_id === installation.id);
                        return <button key={installation.id} type="button" className="flex w-full items-center gap-4 rounded-xl border bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:bg-muted/30" onClick={() => setSelectedInstallationId(installation.id)}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-bold text-primary">{installationIndex + 1}</span>
                            <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase text-muted-foreground">Instalação da obra</p><h4 className="truncate font-semibold">{installation.name}</h4></div>
                            <Badge variant="secondary">{installation.products.length} {installation.products.length === 1 ? "produto" : "produtos"}</Badge>
                            <Badge variant="outline">{installationMedia.length} {installationMedia.length === 1 ? "foto" : "fotos"}</Badge>
                            <span className="flex items-center gap-1 text-sm font-medium text-primary">Abrir <ChevronRight className="h-4 w-4" /></span>
                        </button>;
                    })}
                </div>
            </> : <>
                <div className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
                    <Button type="button" variant="outline" size="icon" onClick={() => setSelectedInstallationId(null)} aria-label="Voltar para instalações"><ArrowLeft className="h-4 w-4" /></Button>
                    <div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase text-muted-foreground">Configuração da instalação</p><h3 className="truncate text-lg font-semibold">{hierarchicalInstallationNumber(selectedIndex)}. {selectedInstallation.name}</h3></div>
                    <Badge variant="secondary">{selectedInstallation.products.length} {selectedInstallation.products.length === 1 ? "produto" : "produtos"}</Badge>
                    <Button type="button" onClick={() => setProductDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />Adicionar produto</Button>
                </div>
                <section className="space-y-5 rounded-xl border bg-muted/10 p-4">
                    <InstallationDetailsEditor
                        key={selectedInstallation.id}
                        installation={selectedInstallation}
                        onSaved={(updated) => setInstallations((current) => current.map((item) => item.id === updated.id ? updated : item))}
                    />
                    <section className="space-y-3 rounded-lg border bg-background p-4">
                        <div className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-primary" /><div><h4 className="text-sm font-semibold">Fotos gerais da instalação</h4><p className="text-xs text-muted-foreground">Estas imagens entrarão no laudo e na lista de figuras.</p></div></div>
                        <Input type="file" accept="image/*" multiple onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            queueInstallationImages(selectedInstallation.id, files);
                            event.currentTarget.value = "";
                        }} />
                        {selectedMedia.length ? <div className="flex flex-wrap gap-2">{selectedMedia.map((item) => <div key={item.id} className="flex items-center overflow-hidden rounded-md border bg-background">
                            <span className="max-w-64 truncate px-2.5 py-1 text-xs">{item.caption || item.filename}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-none border-l text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={deletingMediaId === item.id} onClick={() => void removeInstallationImage(item)} aria-label={`Excluir ${item.caption || item.filename}`}>
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>)}</div> : <p className="text-xs text-muted-foreground">Nenhuma foto adicionada.</p>}
                    </section>
                    <div className="space-y-3">
                        <div><h4 className="font-semibold">Ordem dos produtos no laudo</h4><p className="text-sm text-muted-foreground">Use as setas para definir a sequência. Abra um produto para preencher e visualizar sua tabela.</p></div>
                        {selectedInstallation.products.length === 0 ? <div className="rounded-lg border border-dashed bg-background p-6 text-center text-sm text-muted-foreground">Nenhum produto foi adicionado a esta instalação.</div> : null}
                        {selectedInstallation.products.map((item, productIndex) => <InstalledProductEditor
                            key={item.id}
                            databookId={databookId}
                            number={hierarchicalInstallationNumber(selectedIndex, productIndex, item.suffix)}
                            installationLabel={selectedInstallation.location_identification || selectedInstallation.name}
                            item={item}
                            open={openProducts.has(item.id)}
                            onToggle={() => toggleProduct(item.id)}
                            canMoveUp={productIndex > 0}
                            canMoveDown={productIndex < selectedInstallation.products.length - 1}
                            onMoveUp={() => moveProduct(selectedInstallation.id, productIndex, -1)}
                            onMoveDown={() => moveProduct(selectedInstallation.id, productIndex, 1)}
                        />)}
                    </div>
                </section>
            </>}
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Adicionar instalação</DialogTitle><DialogDescription>Informe um nome claro para identificar o local ou conjunto instalado.</DialogDescription></DialogHeader>
                    <div className="space-y-2"><Label htmlFor="installation-name">Nome da instalação</Label><Input id="installation-name" autoFocus value={name} placeholder="Ex.: Passarela de classificação" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) addInstallation(); }} /></div>
                    <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancelar</Button><Button type="button" disabled={pending || !name.trim()} onClick={addInstallation}>Criar instalação</Button></DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                <DialogContent className="flex max-h-[88dvh] w-[min(900px,calc(100vw-2rem))] max-w-[900px] flex-col overflow-hidden p-0 sm:max-w-[900px]">
                    <DialogHeader className="border-b px-6 py-4">
                        <DialogTitle>Adicionar produto à instalação</DialogTitle>
                        <DialogDescription>Pesquise no catálogo e selecione o produto que deverá entrar no final da ordem atual.</DialogDescription>
                    </DialogHeader>
                    <div className="border-b px-6 py-4">
                        <Label htmlFor="product-search" className="sr-only">Pesquisar produtos</Label>
                        <Input id="product-search" autoFocus value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Pesquisar por nome, código, NCM, unidade, descrição ou outra informação..." />
                        <p className="mt-2 text-xs text-muted-foreground">{filteredProducts.length} de {products.length} produtos encontrados</p>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {filteredProducts.length === 0 ? <div className="py-12 text-center text-sm text-muted-foreground">Nenhum produto corresponde à pesquisa.</div> : null}
                        <div className="grid gap-2">
                            {filteredProducts.map((product) => <button
                                key={product.id}
                                type="button"
                                disabled={pending || !selectedInstallation || !product.id}
                                className="flex w-full items-center gap-4 rounded-lg border bg-background p-4 text-left transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
                                onClick={() => {
                                    if (!selectedInstallation || !product.id) return;
                                    setProductDialogOpen(false);
                                    setProductSearch("");
                                    addProduct(selectedInstallation, product.id);
                                }}
                            >
                                <span className="flex h-10 min-w-16 items-center justify-center rounded-md bg-primary/10 px-2 text-xs font-bold text-primary">{product.code}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="font-medium">{product.description}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">NCM {product.ncm || "não informado"} · Unidade {product.unit || "não informada"}</p>
                                </div>
                                <span className="text-sm font-medium text-primary">Selecionar</span>
                            </button>)}
                        </div>
                    </div>
                    <DialogFooter className="border-t px-6 py-4"><Button type="button" variant="outline" onClick={() => setProductDialogOpen(false)}>Cancelar</Button></DialogFooter>
                </DialogContent>
            </Dialog>
            <Dialog open={imageQueue.length > 0} onOpenChange={(open) => { if (!open && !imageUploading) advanceImageQueue(); }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Legenda da figura</DialogTitle>
                        <DialogDescription>Informe como esta imagem deverá ser identificada no laudo e na lista de figuras.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="rounded-lg border bg-muted/30 p-3">
                            <p className="text-xs font-medium uppercase text-muted-foreground">Arquivo selecionado</p>
                            <p className="mt-1 truncate text-sm font-medium">{imageQueue[0]?.file.name}</p>
                            {imageQueue.length > 1 ? <p className="mt-1 text-xs text-muted-foreground">Depois desta, restam {imageQueue.length - 1} imagens para identificar.</p> : null}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="figure-caption">Legenda</Label>
                            <Input id="figure-caption" autoFocus value={imageCaption} onChange={(event) => setImageCaption(event.target.value)} placeholder="Ex.: Vista geral da instalação" onKeyDown={(event) => { if (event.key === "Enter" && imageCaption.trim() && !imageUploading) void confirmInstallationImage(); }} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" disabled={imageUploading} onClick={advanceImageQueue}>Cancelar imagem</Button>
                        <Button type="button" disabled={imageUploading || !imageCaption.trim()} onClick={() => void confirmInstallationImage()}>{imageUploading ? "Enviando..." : "Adicionar figura"}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function InstallationDetailsEditor({
    installation,
    onSaved,
}: {
    installation: DatabookInstallation;
    onSaved: (installation: DatabookInstallation) => void;
}) {
    const [form, setForm] = useState({
        name: installation.name,
        installer_name: installation.installer_name ?? "",
        inspection_date: installation.inspection_date ?? "",
        validity: installation.validity ?? "",
        inspector_name: installation.inspector_name ?? "",
        general_observations: installation.general_observations ?? "",
    });
    const [saving, startSaving] = useTransition();
    const patch = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
    const save = () => startSaving(async () => {
        const result = await updateDatabookInstallationAction(installation.databook_id, installation.id, form);
        if (!result.success) {
            toast.error(result.error ?? "Erro ao salvar instalação");
            return;
        }
        onSaved({ ...installation, ...form });
        toast.success("Dados da instalação salvos");
    });
    return <section className="space-y-4 rounded-lg border bg-background p-4">
        <div>
            <h4 className="font-semibold">Identificação da instalação</h4>
            <p className="text-xs text-muted-foreground">Estas informações formarão a página de apresentação da instalação no PDF.</p>
        </div>
        <div className="space-y-2">
            <Label htmlFor={`installation-title-${installation.id}`}>Título da instalação *</Label>
            <Input id={`installation-title-${installation.id}`} value={form.name} onChange={(event) => patch("name", event.target.value)} placeholder="Ex.: Passarela classificação" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2"><Label>Instalador responsável</Label><Input value={form.installer_name} onChange={(event) => patch("installer_name", event.target.value)} placeholder="Nome do responsável pela instalação" /></div>
            <div className="space-y-2"><Label>Data da inspeção</Label><Input type="date" value={form.inspection_date} onChange={(event) => patch("inspection_date", event.target.value)} /></div>
            <div className="space-y-2"><Label>Validade</Label><Input value={form.validity} onChange={(event) => patch("validity", event.target.value)} placeholder="Ex.: 12 meses" /></div>
            <div className="space-y-2"><Label>Inspetor da instalação</Label><Input value={form.inspector_name} onChange={(event) => patch("inspector_name", event.target.value)} placeholder="Nome do inspetor" /></div>
        </div>
        <div className="space-y-2"><Label>Observações gerais</Label><Textarea rows={4} value={form.general_observations} onChange={(event) => patch("general_observations", event.target.value)} placeholder="Descreva as adequações realizadas, condições verificadas e demais observações." /></div>
        <div className="flex justify-end"><Button type="button" disabled={saving || !form.name.trim()} onClick={save}>{saving ? "Salvando..." : "Salvar dados da instalação"}</Button></div>
    </section>;
}

function InstalledProductEditor({
    databookId, number, installationLabel, item, open, onToggle, canMoveUp, canMoveDown, onMoveUp, onMoveDown,
}: {
    databookId: string;
    number: string;
    installationLabel: string;
    item: DatabookInstallationProduct;
    open: boolean;
    onToggle: () => void;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
}) {
    const [values, setValues] = useState(item.table_values);
    const [structural, setStructural] = useState(item.structural_evaluation ?? "");
    const [notes, setNotes] = useState(item.general_observations ?? "");
    const [quantity, setQuantity] = useState(String(item.quantity || 1));
    const [unit, setUnit] = useState(item.unit ?? "");
    const [previewOpen, setPreviewOpen] = useState(true);
    const [editProductOpen, setEditProductOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const editableCells = item.table_schema_snapshot.cells.filter((cell) => cell.key
        && !["structural_evaluation", "general_observations"].includes(cell.key)
        && ["input", "long_text", "select", "boolean", "date"].includes(cell.kind));
    const filledFields = editableCells.filter((cell) => {
        const value = values[cell.key!];
        return value !== undefined && value !== null && value !== "";
    }).length;
    const save = () => startTransition(async () => {
        const result = await updateDatabookProductValuesAction(databookId, item.id, {
            table_schema_snapshot: item.table_schema_snapshot,
            table_values: values,
            structural_evaluation: structural,
            general_observations: notes,
            quantity: Number(quantity),
            unit,
        });
        if (result.success) toast.success("Dados técnicos salvos");
        else toast.error(result.error ?? "Erro ao salvar");
    });
    return (
        <article className="overflow-hidden rounded-lg border bg-background">
            <div className="flex items-center gap-2 p-2 pr-3 hover:bg-muted/40">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left" onClick={onToggle} aria-expanded={open}>
                    {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase text-primary">Instalação {number}</p><h4 className="truncate font-medium">{item.title}</h4></div>
                    <Badge variant="secondary">{quantity || "0"} {unit}</Badge>
                    <Badge variant="outline">{filledFields} de {editableCells.length} campos</Badge>
                </button>
                <div className="flex items-center gap-1 border-l pl-2">
                    <Button type="button" variant="ghost" size="icon" disabled={!canMoveUp} onClick={onMoveUp} title="Mover produto para cima"><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="icon" disabled={!canMoveDown} onClick={onMoveDown} title="Mover produto para baixo"><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setEditProductOpen(true)}><Pencil className="mr-2 h-3.5 w-3.5" />Editar produto</Button>
                </div>
            </div>
            {open ? <div className="space-y-4 border-t p-4">
                <div><h5 className="font-semibold">Informações técnicas do produto</h5><p className="text-sm text-muted-foreground">Preencha os dados específicos deste item instalado.</p></div>
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
                    <div className="space-y-1"><Label>Quantidade</Label><Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
                    <div className="space-y-1"><Label>Unidade</Label><Input value={unit} placeholder="Ex.: un, m, kit" onChange={(event) => setUnit(event.target.value)} /></div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                {editableCells.map((cell) => (
                    <div key={cell.id} className={cell.kind === "long_text" ? "space-y-1 md:col-span-2" : "space-y-1"}>
                        <Label>{FIELD_LABELS[cell.key!] || cell.label || "Campo técnico"}{cell.required ? " *" : ""}</Label>
                        {cell.kind === "long_text" ? (
                            <Textarea value={String(values[cell.key!] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [cell.key!]: event.target.value }))} />
                        ) : cell.kind === "boolean" ? (
                            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(values[cell.key!] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [cell.key!]: event.target.value === "true" }))}><option value="">Selecione</option><option value="true">Sim</option><option value="false">Não</option></select>
                        ) : cell.kind === "select" ? (
                            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={String(values[cell.key!] ?? "")} onChange={(event) => setValues((current) => ({ ...current, [cell.key!]: event.target.value }))}>
                                <option value="">Selecione uma opção</option>
                                {(cell.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                        ) : (
                            <Input type={cell.kind === "date" ? "date" : "text"} value={String(values[cell.key!] ?? "")} placeholder={cell.placeholder} onChange={(event) => setValues((current) => ({ ...current, [cell.key!]: event.target.value }))} />
                        )}
                    </div>
                ))}
                <div className="space-y-1 md:col-span-2"><Label>Avaliação estrutural</Label><Textarea value={structural} onChange={(event) => setStructural(event.target.value)} /></div>
                <div className="space-y-1 md:col-span-2"><Label>Observações gerais</Label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></div>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setPreviewOpen((current) => !current)}><Eye className="mr-2 h-4 w-4" />{previewOpen ? "Ocultar prévia" : "Mostrar prévia"}</Button>
                <Button type="button" size="sm" disabled={pending} onClick={save}>{pending ? "Salvando..." : "Salvar dados técnicos"}</Button>
            </div>
            {previewOpen ? <TechnicalTablePreview item={item} values={values} structural={structural} notes={notes} number={number} installationLabel={installationLabel} /> : null}
            </div> : null}
            <ProductEditDialog productId={item.product_id} open={editProductOpen} onOpenChange={setEditProductOpen} />
        </article>
    );
}

function TechnicalTablePreview({
    item, values, structural, notes, number, installationLabel,
}: {
    item: DatabookInstallationProduct;
    values: Record<string, string | number | boolean | null>;
    structural: string;
    notes: string;
    number: string;
    installationLabel: string;
}) {
    const schema = item.table_schema_snapshot;
    const snapshot = item.product_snapshot;
    const displayValue = (cell: (typeof schema.cells)[number]) => {
        if (cell.kind === "label") return cell.label ?? "";
        if (cell.kind === "fixed") return cell.defaultValue ?? cell.label ?? "";
        if (cell.kind === "variable") {
            if (cell.variable === "produto.descricao") return snapshot.description ?? item.title;
            if (cell.variable === "produto.fabricante") return snapshot.manufacturer ?? "—";
            if (cell.variable === "instalacao.local") return installationLabel || "—";
            if (cell.variable === "manual.referencia") {
                const manual = item.manual_reference_snapshot;
                if (!manual) return "Sem manual vinculado";
                const reference = manual.reference ? String(manual.reference) : "";
                const type = manual.authorship === "internal" ? "Apêndice" : "Anexo";
                const title = manual.title ? String(manual.title) : "";
                return [reference || type, title].filter(Boolean).join(" — ");
            }
            if (cell.key && snapshot[cell.key] !== undefined) return snapshot[cell.key];
            const key = cell.variable?.split(".").pop() ?? "";
            return snapshot[key] ?? cell.label ?? "—";
        }
        const value = cell.key ? values[cell.key] : null;
        if (typeof value === "boolean") return value ? "Sim" : "Não";
        return value === undefined || value === null || value === "" ? "—" : String(value);
    };
    return (
        <section className="rounded-xl border bg-muted/20 p-4">
            <div className="mb-3"><h5 className="font-semibold">Prévia da tabela no DataBook</h5><p className="text-xs text-muted-foreground">Visualização aproximada usando os dados preenchidos acima.</p></div>
            <div className="overflow-x-auto rounded-lg border bg-white p-5">
                <div className="mx-auto min-w-[700px] max-w-5xl">
                    <div className="mb-3 border-y-2 border-[#315b9b] py-2 text-center text-lg font-bold text-[#315b9b]">INSTALAÇÃO {number} — {item.title.toUpperCase()}</div>
                    <div className="grid overflow-hidden border border-[#afbdd4]" style={{ gridTemplateColumns: schema.columns.map((column) => `${column.width ?? 180}fr`).join(" "), gridTemplateRows: `repeat(${schema.rows}, minmax(30px, auto))` }}>
                        {[...schema.cells].sort((a, b) => a.row - b.row || a.column - b.column).map((cell) => <div
                            key={cell.id}
                            className={`min-h-8 border-b border-r border-[#c4cede] px-2 py-1 text-sm text-[#315b9b] ${cell.kind === "label" ? "font-bold" : "italic"}`}
                            style={{ gridColumn: `${cell.column + 1} / span ${cell.columnSpan ?? 1}`, gridRow: `${cell.row + 1} / span ${cell.rowSpan ?? 1}`, background: cell.row % 2 === 0 ? "#dce4f2" : "#f5f7fb" }}
                        >{String(displayValue(cell))}</div>)}
                    </div>
                    {structural ? <div className="mt-3 bg-[#dce4f2] p-3 text-sm text-[#315b9b]"><strong>Avaliação estrutural: </strong>{structural}</div> : null}
                    {notes ? <div className="mt-3 border-y border-[#315b9b] p-3 text-sm italic text-[#315b9b]"><strong className="not-italic">Observações gerais: </strong>{notes}</div> : null}
                </div>
            </div>
        </section>
    );
}

function ProductEditDialog({ productId, open, onOpenChange }: { productId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
    const [product, setProduct] = useState<Product | null>(null);
    const [config, setConfig] = useState<ProductDatabookConfig | null>(null);
    const [manuals, setManuals] = useState<ProductManual[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!open) return;
        void Promise.all([
            getProductAction(productId),
            getProductDatabookConfigAction(productId),
            listProductManualsAction(productId),
        ]).then(([productResult, configResult, manualsResult]) => {
            setProduct(productResult.data ?? null);
            setConfig(configResult.success ? configResult.data ?? null : null);
            setManuals(manualsResult.data ?? []);
            setLoaded(true);
        });
    }, [open, productId]);

    const update = async (formData: FormData) => {
        const result = await updateProductAction(productId, formData);
        if (!result.success) {
            toast.error(result.error ?? "Erro ao atualizar produto");
            return;
        }
        toast.success("Produto atualizado");
        onOpenChange(false);
    };

    return <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92dvh] w-[96vw] max-w-none flex-col overflow-hidden p-0 sm:max-w-none">
            <DialogHeader className="border-b px-6 py-4"><DialogTitle>Editar produto</DialogTitle><DialogDescription>Altere o cadastro sem sair da instalação. A tabela já copiada para este item permanece independente.</DialogDescription></DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
                {!loaded ? <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Carregando produto...</div> : null}
                {loaded && product ? <ProductForm
                    initialData={product}
                    action={update}
                    onCancel={() => onOpenChange(false)}
                    databookContent={config ? <ProductDatabookPanel productId={productId} initialConfig={config} initialManuals={manuals} view="table" /> : undefined}
                    manualsContent={config ? <ProductDatabookPanel productId={productId} initialConfig={config} initialManuals={manuals} view="manuals" /> : undefined}
                /> : null}
                {loaded && !product ? <div className="py-10 text-center text-sm text-muted-foreground">Não foi possível carregar o produto.</div> : null}
            </div>
        </DialogContent>
    </Dialog>;
}
