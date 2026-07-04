"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    Check,
    Download,
    FileText,
    Loader2,
    Plus,
    Trash2,
    Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeliveryCompositor } from "@/components/delivery/delivery-compositor";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
    addDeliveryEvidenceAction,
    addDeliveryInstallationAction,
    deleteDeliveryEvidenceAction,
    deleteDeliveryInstallationAction,
    updateDeliveryAreaAction,
    updateDeliveryProjectAction,
    type DeliveryProjectDetail,
} from "@/actions/delivery-project-actions";
import {
    getDeliveryAreaStatusLabel,
    getDeliveryEvidenceKindLabel,
    getDeliveryProjectStatusLabel,
} from "@/lib/delivery/delivery-status";
import {
    deliveryProjectEvidenceUploadApiUrl,
    deliveryProjectExportApiUrl,
    deliveryProjectPdfApiUrl,
} from "@/lib/delivery/delivery-path";
import type {
    DeliveryAreaStatus,
    DeliveryEvidenceKind,
    DeliveryProjectStatus,
} from "@/types/delivery-types";
import type { TechnicalEquipment } from "@/types/technical-equipment-types";

const PROJECT_STATUSES: DeliveryProjectStatus[] = [
    "planning",
    "installing",
    "documentation",
    "review",
    "delivered",
];

const AREA_STATUSES: DeliveryAreaStatus[] = ["pending", "in_progress", "done"];

const EVIDENCE_KINDS: DeliveryEvidenceKind[] = [
    "photo_before",
    "photo_during",
    "photo_after",
    "document",
    "other",
];

interface DeliveryProjectWorkspaceProps {
    initial: DeliveryProjectDetail;
    equipmentOptions: TechnicalEquipment[];
}

export function DeliveryProjectWorkspace({
    initial,
    equipmentOptions,
}: DeliveryProjectWorkspaceProps) {
    const router = useRouter();
    const [detail, setDetail] = useState(initial);
    const [selectedAreaId, setSelectedAreaId] = useState(initial.areas[0]?.id ?? "");
    const [evidenceKind, setEvidenceKind] = useState<DeliveryEvidenceKind>("photo_after");
    const [uploading, setUploading] = useState(false);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        setDetail(initial);
    }, [initial]);

    const project = detail.project;
    const selectedArea = detail.areas.find((a) => a.id === selectedAreaId) ?? detail.areas[0];

    const areaProgress = useMemo(() => {
        const total = detail.areas.length;
        const done = detail.areas.filter((a) => a.status === "done").length;
        return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
    }, [detail.areas]);

    const refresh = useCallback(() => {
        router.refresh();
    }, [router]);

    const areaEvidence = detail.evidence.filter((e) => e.delivery_area_id === selectedArea?.id);
    const areaInstallations = detail.installations.filter(
        (i) => i.delivery_area_id === selectedArea?.id,
    );

    const updateProjectField = async (
        patch: Parameters<typeof updateDeliveryProjectAction>[1],
    ) => {
        if (!project.id) return;
        const res = await updateDeliveryProjectAction(project.id, patch);
        if (res.success) {
            setDetail((d) => ({ ...d, project: { ...d.project, ...patch } }));
            toast.success("Projeto atualizado");
            refresh();
        } else {
            toast.error(res.error || "Erro ao atualizar");
        }
    };

    const toggleChecklistItem = async (itemId: string) => {
        if (!selectedArea?.id) return;
        const checklist = selectedArea.checklist.map((item) =>
            item.id === itemId ? { ...item, done: !item.done } : item,
        );
        const res = await updateDeliveryAreaAction(selectedArea.id, { checklist });
        if (res.success) {
            setDetail((d) => ({
                ...d,
                areas: d.areas.map((a) =>
                    a.id === selectedArea.id ? { ...a, checklist } : a,
                ),
            }));
        }
    };

    const handleEvidenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !project.id || !selectedArea?.id) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(deliveryProjectEvidenceUploadApiUrl(project.id), {
                method: "POST",
                body: formData,
            });
            if (!res.ok) throw new Error("Falha no upload");
            const data = await res.json();
            const addRes = await addDeliveryEvidenceAction({
                projectId: project.id,
                areaId: selectedArea.id,
                kind: evidenceKind,
                filename: data.filename,
                url: data.url,
                type: data.type,
            });
            if (!addRes.success) throw new Error(addRes.error);
            toast.success("Evidência registrada");
            refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Erro no upload");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const [newInstallEquipmentId, setNewInstallEquipmentId] = useState("");
    const [newInstallQty, setNewInstallQty] = useState("1");
    const [newInstallTag, setNewInstallTag] = useState("");

    const handleAddInstallation = () => {
        if (!project.id || !selectedArea?.id || !newInstallEquipmentId) {
            toast.error("Selecione um equipamento");
            return;
        }
        startTransition(async () => {
            const res = await addDeliveryInstallationAction({
                projectId: project.id!,
                areaId: selectedArea.id!,
                technicalEquipmentId: newInstallEquipmentId,
                quantity: Number(newInstallQty) || 1,
                tag: newInstallTag || undefined,
            });
            if (res.success) {
                toast.success("Equipamento vinculado");
                setNewInstallEquipmentId("");
                setNewInstallTag("");
                refresh();
            } else {
                toast.error(res.error || "Erro ao vincular");
            }
        });
    };

    const exportUrl = project.id ? deliveryProjectExportApiUrl(project.id) : "#";
    const pdfUrl = project.id ? deliveryProjectPdfApiUrl(project.id) : "#";

    return (
        <div className="flex flex-col h-full min-h-0 gap-4 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                    <Button variant="ghost" size="sm" className="mb-1 -ml-2" asChild>
                        <Link href="/delivery-projects">
                            <ArrowLeft className="h-4 w-4 mr-1" />
                            Projetos de entrega
                        </Link>
                    </Button>
                    <h1 className="text-xl font-bold truncate">{project.title}</h1>
                    <p className="text-sm text-muted-foreground">
                        {project.budget_code ? `Orçamento ${project.budget_code}` : null}
                        {project.client_name ? ` · ${project.client_name}` : null}
                        {project.databook_template_name
                            ? ` · DataBook: ${project.databook_template_name}`
                            : null}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Select
                        value={project.status}
                        onValueChange={(v) =>
                            updateProjectField({ status: v as DeliveryProjectStatus })
                        }
                    >
                        <SelectTrigger className="w-[180px]">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {PROJECT_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                    {getDeliveryProjectStatusLabel(s)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button asChild variant="outline">
                        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                            <FileText className="h-4 w-4 mr-2" />
                            Gerar DataBook PDF
                        </a>
                    </Button>
                    <Button asChild variant="default">
                        <a href={exportUrl} download>
                            <Download className="h-4 w-4 mr-2" />
                            Exportar pacote
                        </a>
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="installation" className="flex flex-col flex-1 min-h-0 gap-4">
                <TabsList className="w-fit">
                    <TabsTrigger value="installation">Instalação e áreas AD</TabsTrigger>
                    <TabsTrigger value="compositor">Compositor do DataBook</TabsTrigger>
                </TabsList>

                <TabsContent value="compositor" className="flex-1 min-h-[480px] mt-0 data-[state=inactive]:hidden">
                    {project.id ? (
                        <DeliveryCompositor
                            projectId={project.id}
                            documentTitle={project.title || "DataBook de entrega"}
                        />
                    ) : null}
                </TabsContent>

                <TabsContent value="installation" className="flex flex-col flex-1 min-h-0 gap-4 mt-0 data-[state=inactive]:hidden">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Progresso</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-bold">{areaProgress.percent}%</p>
                        <p className="text-xs text-muted-foreground">
                            {areaProgress.done} de {areaProgress.total} áreas concluídas
                        </p>
                    </CardContent>
                </Card>
                <Card className="md:col-span-2">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Dados do contrato</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <Label className="text-xs">Referência (OB)</Label>
                            <Input
                                defaultValue={project.contract_ref ?? ""}
                                onBlur={(e) =>
                                    updateProjectField({ contract_ref: e.target.value })
                                }
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Gestor</Label>
                            <Input
                                defaultValue={project.gestor_nome ?? ""}
                                onBlur={(e) =>
                                    updateProjectField({ gestor_nome: e.target.value })
                                }
                            />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">
                <aside className="w-full lg:w-64 shrink-0 space-y-1 overflow-y-auto max-h-[40vh] lg:max-h-none border rounded-lg p-2">
                    {detail.areas.map((area) => (
                        <button
                            key={area.id}
                            type="button"
                            onClick={() => setSelectedAreaId(area.id!)}
                            className={cn(
                                "w-full text-left rounded-md px-3 py-2 text-sm transition-colors",
                                selectedArea?.id === area.id
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted",
                            )}
                        >
                            <div className="font-mono text-xs opacity-70">{area.code}</div>
                            <div className="truncate">{area.title}</div>
                            <Badge variant="outline" className="mt-1 text-[10px]">
                                {getDeliveryAreaStatusLabel(area.status)}
                            </Badge>
                        </button>
                    ))}
                </aside>

                {selectedArea ? (
                    <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    {selectedArea.code} — {selectedArea.title}
                                </h2>
                            </div>
                            <Select
                                value={selectedArea.status}
                                onValueChange={async (v) => {
                                    const res = await updateDeliveryAreaAction(selectedArea.id!, {
                                        status: v as DeliveryAreaStatus,
                                    });
                                    if (res.success) refresh();
                                }}
                            >
                                <SelectTrigger className="w-[160px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {AREA_STATUSES.map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {getDeliveryAreaStatusLabel(s)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Checklist</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {selectedArea.checklist.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => toggleChecklistItem(item.id)}
                                        className="flex w-full items-start gap-2 rounded-md border p-2 text-left text-sm hover:bg-muted/50"
                                    >
                                        <span
                                            className={cn(
                                                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                                                item.done && "bg-primary text-primary-foreground border-primary",
                                            )}
                                        >
                                            {item.done ? <Check className="h-3 w-3" /> : null}
                                        </span>
                                        <span className={item.done ? "line-through opacity-60" : ""}>
                                            {item.text}
                                        </span>
                                    </button>
                                ))}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Evidências (fotos e documentos)</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex flex-wrap gap-2 items-end">
                                    <div className="space-y-1">
                                        <Label className="text-xs">Tipo</Label>
                                        <Select
                                            value={evidenceKind}
                                            onValueChange={(v) =>
                                                setEvidenceKind(v as DeliveryEvidenceKind)
                                            }
                                        >
                                            <SelectTrigger className="w-[180px]">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {EVIDENCE_KINDS.map((k) => (
                                                    <SelectItem key={k} value={k}>
                                                        {getDeliveryEvidenceKindLabel(k)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <label>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*,.pdf"
                                            onChange={handleEvidenceUpload}
                                            disabled={uploading}
                                        />
                                        <Button type="button" variant="outline" asChild disabled={uploading}>
                                            <span>
                                                {uploading ? (
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                ) : (
                                                    <Upload className="h-4 w-4 mr-2" />
                                                )}
                                                Enviar arquivo
                                            </span>
                                        </Button>
                                    </label>
                                </div>
                                <ul className="space-y-2">
                                    {areaEvidence.map((ev) => (
                                        <li
                                            key={ev.id}
                                            className="flex items-center justify-between rounded border p-2 text-sm"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-medium truncate">{ev.filename}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {getDeliveryEvidenceKindLabel(ev.kind)}
                                                </p>
                                            </div>
                                            <div className="flex gap-1 shrink-0">
                                                <Button variant="ghost" size="sm" asChild>
                                                    <a href={ev.url} target="_blank" rel="noreferrer">
                                                        Abrir
                                                    </a>
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={async () => {
                                                        if (!project.id || !ev.id) return;
                                                        await deleteDeliveryEvidenceAction(
                                                            ev.id,
                                                            project.id,
                                                        );
                                                        refresh();
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </li>
                                    ))}
                                    {areaEvidence.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                            Nenhuma evidência nesta área.
                                        </p>
                                    ) : null}
                                </ul>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm">Equipamentos instalados</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid gap-2 sm:grid-cols-4">
                                    <div className="sm:col-span-2 space-y-1">
                                        <Label className="text-xs">Equipamento (catálogo técnico)</Label>
                                        <Select
                                            value={newInstallEquipmentId}
                                            onValueChange={setNewInstallEquipmentId}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecionar..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {equipmentOptions.map((eq) => (
                                                    <SelectItem key={eq.id} value={eq.id!}>
                                                        {eq.code} — {eq.description}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">Qtd</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            value={newInstallQty}
                                            onChange={(e) => setNewInstallQty(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs">TAG</Label>
                                        <Input
                                            value={newInstallTag}
                                            onChange={(e) => setNewInstallTag(e.target.value)}
                                            placeholder="LV-01"
                                        />
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleAddInstallation}
                                    disabled={pending}
                                >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Vincular equipamento
                                </Button>

                                <ul className="space-y-2">
                                    {areaInstallations.map((ins) => (
                                        <li
                                            key={ins.id}
                                            className="flex items-center justify-between rounded border p-2 text-sm"
                                        >
                                            <div>
                                                <p className="font-medium">
                                                    {ins.equipment_code} — {ins.equipment_description}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    ×{ins.quantity}
                                                    {ins.tag ? ` · TAG ${ins.tag}` : ""}
                                                    {ins.include_manual_in_export
                                                        ? " · manual no pacote"
                                                        : ""}
                                                </p>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={async () => {
                                                    if (!project.id || !ins.id) return;
                                                    await deleteDeliveryInstallationAction(
                                                        ins.id,
                                                        project.id,
                                                    );
                                                    refresh();
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>

                        <div className="space-y-1">
                            <Label className="text-xs">Observações da área</Label>
                            <Textarea
                                defaultValue={selectedArea.description ?? ""}
                                rows={3}
                                onBlur={async (e) => {
                                    await updateDeliveryAreaAction(selectedArea.id!, {
                                        description: e.target.value,
                                    });
                                }}
                            />
                        </div>
                    </div>
                ) : null}
            </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
