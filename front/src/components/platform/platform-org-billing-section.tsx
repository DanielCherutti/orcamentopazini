"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
    cancelPlatformChargeAction,
    createManualPlatformChargeAction,
    updateTenantBillingProfileAction,
    type TenantBillingProfileView,
} from "@/actions/platform-billing-actions";
import type { PlatformCharge } from "@/types/billing-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
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
import { toast } from "@/lib/toast";
import { ExternalLink, Plus, Receipt } from "lucide-react";

function formatBrl(cents: number): string {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_LABELS: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    overdue: "Vencido",
    cancelled: "Cancelado",
    refunded: "Estornado",
};

function ChargeStatusBadge({ status }: { status: string }) {
    const variant =
        status === "paid"
            ? "default"
            : status === "overdue"
              ? "destructive"
              : status === "cancelled"
                ? "secondary"
                : "outline";
    return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}

function CreateChargeDialog({
    tenantRef,
    open,
    onOpenChange,
}: {
    tenantRef: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    function submit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        startTransition(async () => {
            const res = await createManualPlatformChargeAction(tenantRef, {
                amountBrl: Number(fd.get("amountBrl")),
                dueDate: String(fd.get("dueDate")),
                description: String(fd.get("description")),
            });
            if (!res.success) {
                setError(res.error ?? "Erro ao gerar cobrança");
                return;
            }
            toast.success("Cobrança gerada no Asaas");
            onOpenChange(false);
            router.refresh();
        });
    }

    const defaultDue = new Date();
    defaultDue.setDate(defaultDue.getDate() + 7);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Gerar cobrança</DialogTitle>
                    <DialogDescription>
                        Cria cobrança avulsa no Asaas (boleto/PIX conforme configuração da conta).
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="charge-amount">Valor (R$)</Label>
                        <Input
                            id="charge-amount"
                            name="amountBrl"
                            type="number"
                            step="0.01"
                            min="0.01"
                            required
                            disabled={pending}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="charge-due">Vencimento</Label>
                        <Input
                            id="charge-due"
                            name="dueDate"
                            type="date"
                            defaultValue={defaultDue.toISOString().slice(0, 10)}
                            required
                            disabled={pending}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="charge-desc">Descrição</Label>
                        <Input
                            id="charge-desc"
                            name="description"
                            required
                            placeholder="Mensalidade, ajuste, etc."
                            disabled={pending}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? "Gerando…" : "Gerar cobrança"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

type Props = {
    tenantRef: string;
    profile: TenantBillingProfileView;
    charges: PlatformCharge[];
    canWrite: boolean;
};

export function PlatformOrgBillingSection({ tenantRef, profile, charges, canWrite }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [createOpen, setCreateOpen] = useState(false);
    const [email, setEmail] = useState(profile.billing_email ?? "");
    const [name, setName] = useState(profile.billing_name ?? "");
    const [doc, setDoc] = useState(profile.billing_cpf_cnpj ?? "");
    const [phone, setPhone] = useState(profile.billing_phone ?? "");

    function saveProfile(e: React.FormEvent) {
        e.preventDefault();
        startTransition(async () => {
            const res = await updateTenantBillingProfileAction(tenantRef, {
                billing_email: email,
                billing_name: name,
                billing_cpf_cnpj: doc,
                billing_phone: phone,
                billing_enabled: true,
            });
            if (!res.success) {
                toast.error(res.error ?? "Erro ao salvar perfil");
                return;
            }
            toast.success("Perfil de cobrança salvo");
            router.refresh();
        });
    }

    function cancelCharge(chargeId: string) {
        startTransition(async () => {
            const res = await cancelPlatformChargeAction(tenantRef, chargeId);
            if (!res.success) toast.error(res.error ?? "Erro");
            else {
                toast.success("Cobrança cancelada");
                router.refresh();
            }
        });
    }

    return (
        <div className="space-y-4">
            {!profile.profileComplete && (
                <Card className="border-amber-500/40 bg-amber-500/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Perfil de cobrança incompleto</CardTitle>
                        <CardDescription>
                            Preencha e-mail, nome e CPF/CNPJ antes de gerar cobranças no Asaas.
                        </CardDescription>
                    </CardHeader>
                </Card>
            )}

            <Card className="platform-ops-surface border-0 shadow-none">
                <CardHeader>
                    <CardTitle className="text-base">Dados de cobrança</CardTitle>
                    <CardDescription>Cliente Asaas vinculado a esta organização.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="bill-email">E-mail</Label>
                            <Input
                                id="bill-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={!canWrite || pending}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bill-name">Nome / Razão social</Label>
                            <Input
                                id="bill-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                disabled={!canWrite || pending}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bill-doc">CPF/CNPJ</Label>
                            <Input
                                id="bill-doc"
                                value={doc}
                                onChange={(e) => setDoc(e.target.value)}
                                disabled={!canWrite || pending}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="bill-phone">Telefone</Label>
                            <Input
                                id="bill-phone"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                disabled={!canWrite || pending}
                            />
                        </div>
                        {profile.asaas_customer_id && (
                            <p className="sm:col-span-2 text-xs text-muted-foreground font-mono">
                                Cliente Asaas: {profile.asaas_customer_id}
                            </p>
                        )}
                        {canWrite && (
                            <div className="sm:col-span-2">
                                <Button type="submit" disabled={pending}>
                                    Salvar perfil
                                </Button>
                            </div>
                        )}
                    </form>
                </CardContent>
            </Card>

            <Card className="platform-ops-surface border-0 shadow-none">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div>
                        <CardTitle className="text-base flex items-center gap-2">
                            <Receipt className="size-4" />
                            Cobranças
                        </CardTitle>
                        <CardDescription>Histórico local sincronizado com Asaas.</CardDescription>
                    </div>
                    {canWrite && profile.profileComplete && (
                        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                            <Plus className="size-4" />
                            Gerar cobrança
                        </Button>
                    )}
                </CardHeader>
                <CardContent>
                    {charges.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma cobrança registrada.</p>
                    ) : (
                        <ul className="divide-y text-sm">
                            {charges.map((c) => (
                                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                                    <div>
                                        <p className="font-medium">{c.description}</p>
                                        <p className="text-muted-foreground text-xs">
                                            {formatBrl(c.amount_cents)} · venc. {c.due_date.slice(0, 10)} ·{" "}
                                            {c.type === "subscription" ? "Recorrente" : "Avulsa"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <ChargeStatusBadge status={c.status} />
                                        {c.asaas_invoice_url && (
                                            <Button variant="outline" size="sm" asChild>
                                                <a
                                                    href={c.asaas_invoice_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="gap-1"
                                                >
                                                    <ExternalLink className="size-3.5" />
                                                    Pagar
                                                </a>
                                            </Button>
                                        )}
                                        {canWrite && c.status === "pending" && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => cancelCharge(c.id)}
                                                disabled={pending}
                                            >
                                                Cancelar
                                            </Button>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {canWrite && (
                <CreateChargeDialog
                    tenantRef={tenantRef}
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                />
            )}
        </div>
    );
}
