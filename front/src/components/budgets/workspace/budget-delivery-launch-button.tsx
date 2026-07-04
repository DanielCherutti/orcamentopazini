"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createDeliveryProjectFromBudgetAction,
    getDeliveryProjectByBudgetAction,
    type DeliveryProjectCreationMode,
} from "@/actions/delivery-project-actions";
import { listDatabookTemplatesForSelectAction } from "@/actions/databook-template-actions";
import { deliveryProjectUrl } from "@/lib/delivery/delivery-path";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { DatabookTemplate } from "@/types/databook-template-types";

interface BudgetDeliveryLaunchButtonProps {
    budgetId: string;
}

export function BudgetDeliveryLaunchButton({ budgetId }: BudgetDeliveryLaunchButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [templates, setTemplates] = useState<DatabookTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
    const [creationMode, setCreationMode] = useState<DeliveryProjectCreationMode>("template");

    useEffect(() => {
        if (!dialogOpen) return;
        void listDatabookTemplatesForSelectAction().then((list) => {
            setTemplates(list);
            const def = list.find((t) => t.is_default) ?? list[0];
            if (def?.id) setSelectedTemplateId(def.id);
        });
    }, [dialogOpen]);

    const openProject = async (existingId?: string) => {
        if (existingId) {
            router.push(deliveryProjectUrl(existingId));
            return;
        }
        if (creationMode === "template" && !selectedTemplateId) {
            toast.error("Selecione um DataBook ou comece do zero");
            return;
        }
        setLoading(true);
        try {
            const res = await createDeliveryProjectFromBudgetAction(budgetId, {
                mode: creationMode,
                databookTemplateId:
                    creationMode === "template" ? selectedTemplateId : undefined,
            });
            if (res.success && res.id) {
                toast.success(
                    creationMode === "blank"
                        ? "Projeto criado — adicione as áreas AD"
                        : "Projeto de entrega criado",
                );
                setDialogOpen(false);
                router.push(deliveryProjectUrl(res.id));
            } else {
                toast.error(res.error || "Não foi possível criar o projeto");
            }
        } finally {
            setLoading(false);
        }
    };

    const handleClick = async () => {
        setLoading(true);
        try {
            const existing = await getDeliveryProjectByBudgetAction(budgetId);
            if (existing.success && existing.data?.id) {
                router.push(deliveryProjectUrl(existing.data.id));
                return;
            }
            setDialogOpen(true);
        } finally {
            setLoading(false);
        }
    };

    const canCreate =
        creationMode === "blank" || (creationMode === "template" && !!selectedTemplateId);

    return (
        <>
            <Button size="sm" variant="secondary" disabled={loading} onClick={handleClick} title="Entrega técnica">
                {loading ? (
                    <Loader2 className="h-3.5 w-3.5 xl:mr-1.5 animate-spin" />
                ) : (
                    <HardHat className="h-3.5 w-3.5 xl:mr-1.5" />
                )}
                <span className="hidden xl:inline">Entrega técnica</span>
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Abrir projeto de entrega</DialogTitle>
                        <DialogDescription>
                            Use um modelo pronto ou monte as áreas AD do zero neste projeto.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label>Como deseja começar?</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setCreationMode("template")}
                                    className={cn(
                                        "rounded-lg border p-3 text-left text-sm transition-colors",
                                        creationMode === "template"
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                            : "hover:bg-muted/50",
                                    )}
                                >
                                    <p className="font-medium">Usar modelo de DataBook</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Copia áreas e checklist de um cadastro reutilizável.
                                    </p>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreationMode("blank")}
                                    className={cn(
                                        "rounded-lg border p-3 text-left text-sm transition-colors",
                                        creationMode === "blank"
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                                            : "hover:bg-muted/50",
                                    )}
                                >
                                    <p className="font-medium">Começar do zero</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Projeto vazio; você cria as áreas AD no workspace.
                                    </p>
                                </button>
                            </div>
                        </div>

                        {creationMode === "template" ? (
                            <div className="space-y-2">
                                <Label>DataBook</Label>
                                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Selecione..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((t) => (
                                            <SelectItem key={t.id} value={t.id!}>
                                                {t.name}
                                                {t.is_default ? " (padrão)" : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">
                                    Cadastre ou edite modelos em{" "}
                                    <a href="/dashboard/databooks" className="underline">
                                        Modelos de DataBook
                                    </a>
                                    .
                                </p>
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
                                Nenhum modelo será vinculado. Após criar o projeto, use a aba{" "}
                                <strong>Instalação e áreas AD</strong> para adicionar áreas, checklist,
                                fotos e equipamentos.
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button disabled={loading || !canCreate} onClick={() => openProject()}>
                            {loading ? "Criando..." : "Criar projeto"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
