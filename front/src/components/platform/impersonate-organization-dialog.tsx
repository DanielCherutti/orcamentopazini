"use client";

import { useState, useTransition } from "react";
import { startImpersonationAction } from "@/actions/platform-impersonation-actions";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { Headphones } from "lucide-react";
import { useRouter } from "next/navigation";

export function ImpersonateOrganizationDialog({
    tenantRef,
    orgName,
}: {
    tenantRef: string;
    orgName: string;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [mode, setMode] = useState<"readonly" | "full">("readonly");
    const [ttl, setTtl] = useState("60");
    const [pending, startTransition] = useTransition();

    function submit() {
        startTransition(async () => {
            const res = await startImpersonationAction({
                tenantRef,
                reason,
                mode,
                ttlMinutes: Number(ttl),
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao entrar");
                return;
            }
            setOpen(false);
            router.push("/dashboard");
            router.refresh();
        });
    }

    return (
        <>
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>
                <Headphones className="h-4 w-4" />
                Entrar como suporte
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Modo suporte — {orgName}</DialogTitle>
                        <DialogDescription>
                            Acesso auditado à organização. Banner visível para transparência.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="imp-reason">Motivo (obrigatório)</Label>
                            <Input
                                id="imp-reason"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Ex.: investigar erro no orçamento #123"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Modo</Label>
                            <Select value={mode} onValueChange={(v) => setMode(v as "readonly" | "full")}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="readonly">Somente leitura (recomendado)</SelectItem>
                                    <SelectItem value="full">Acesso completo (auditado)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Duração</Label>
                            <Select value={ttl} onValueChange={setTtl}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30">30 minutos</SelectItem>
                                    <SelectItem value="60">60 minutos</SelectItem>
                                    <SelectItem value="120">120 minutos</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={submit} disabled={pending || reason.trim().length < 10}>
                            Entrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
