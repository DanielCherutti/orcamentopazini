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
} from "@/actions/delivery-project-actions";
import { listDatabookTemplatesForSelectAction } from "@/actions/databook-template-actions";
import { deliveryProjectUrl } from "@/lib/delivery/delivery-path";
import { toast } from "@/lib/toast";
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
        if (!selectedTemplateId) {
            toast.error("Selecione um DataBook");
            return;
        }
        setLoading(true);
        try {
            const res = await createDeliveryProjectFromBudgetAction(budgetId, selectedTemplateId);
            if (res.success && res.id) {
                toast.success("Projeto de entrega criado");
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
                            Escolha o DataBook que define as áreas e o checklist desta obra.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
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
                                DataBooks
                            </a>
                            .
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button disabled={loading || !selectedTemplateId} onClick={() => openProject()}>
                            {loading ? "Criando..." : "Criar projeto"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
