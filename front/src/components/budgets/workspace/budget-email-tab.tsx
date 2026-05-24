"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Send, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { Budget } from "@/types/budget-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { getCustomerAction } from "@/actions/client-actions";
import { sendBudgetProposalByEmailAction } from "@/actions/budget-email-actions";
import { budgetPdfApiUrl } from "@/lib/budgets/budget-path";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface BudgetEmailTabProps {
    budget: Budget;
}

export function BudgetEmailTab({ budget }: BudgetEmailTabProps) {
    const budgetId = String(budget.id ?? "");
    const code = budget.code?.trim() || "";
    const title = budget.title?.trim() || "Proposta comercial";

    const defaultSubject = useMemo(
        () => (code ? `Proposta comercial ${code} — ${title}` : `Proposta comercial — ${title}`),
        [code, title]
    );

    const [to, setTo] = useState("");
    const [subject, setSubject] = useState(defaultSubject);
    const [message, setMessage] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [loadingClient, setLoadingClient] = useState(false);

    useEffect(() => {
        setSubject(defaultSubject);
    }, [defaultSubject]);

    useEffect(() => {
        const clientId = budget.client_id?.trim();
        if (!clientId) return;
        let cancelled = false;
        setLoadingClient(true);
        getCustomerAction(clientId).then((res) => {
            if (cancelled) return;
            if (res.success && res.data?.email?.trim()) {
                setTo((prev) => prev || res.data!.email!.trim());
            }
            setLoadingClient(false);
        });
        return () => {
            cancelled = true;
        };
    }, [budget.client_id]);

    const pdfPreviewUrl = budgetId ? budgetPdfApiUrl(budgetId) : "#";

    const handleSend = async () => {
        const email = to.trim();
        if (!email) {
            toast.error("Informe o e-mail do destinatário.");
            return;
        }
        setSending(true);
        setSent(false);
        const res = await sendBudgetProposalByEmailAction(budgetId, {
            to: email,
            subject: subject.trim() || defaultSubject,
            message: message.trim() || undefined,
        });
        setSending(false);
        if (res.success) {
            setSent(true);
            toast.success("Proposta enviada por e-mail.");
            return;
        }
        toast.error(res.error || "Não foi possível enviar o e-mail.");
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-slate-50 to-slate-100/80">
            <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
                <div className="mb-6 flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Mail className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">Enviar por e-mail</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            O anexo é o mesmo PDF da aba Impressão — proposta completa com capa,
                            adequações e orçamento.
                        </p>
                    </div>
                </div>

                <Card className="shadow-md border-border/80">
                    <CardHeader className="border-b bg-card/80">
                        <CardTitle className="text-base font-semibold">Destinatário</CardTitle>
                        <CardDescription>
                            {loadingClient
                                ? "Buscando e-mail do cliente vinculado…"
                                : budget.client_name
                                  ? `Cliente: ${budget.client_name}`
                                  : "Você pode informar qualquer e-mail válido."}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-6">
                        <div className="space-y-2">
                            <Label htmlFor="budget-email-to">E-mail do destinatário</Label>
                            <Input
                                id="budget-email-to"
                                type="email"
                                autoComplete="email"
                                placeholder="cliente@empresa.com.br"
                                value={to}
                                onChange={(e) => setTo(e.target.value)}
                                disabled={sending}
                                className="h-10"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="budget-email-subject">Assunto</Label>
                            <Input
                                id="budget-email-subject"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                disabled={sending}
                                className="h-10"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="budget-email-message">Mensagem (opcional)</Label>
                            <Textarea
                                id="budget-email-message"
                                rows={4}
                                placeholder="Olá, segue nossa proposta conforme conversamos…"
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                disabled={sending}
                                className="resize-y min-h-[96px]"
                            />
                            <p className="text-xs text-muted-foreground">
                                Se deixar em branco, usamos um texto padrão de apresentação da proposta.
                            </p>
                        </div>

                        <div
                            className={cn(
                                "flex items-center gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3",
                                "text-sm text-muted-foreground"
                            )}
                        >
                            <FileText className="h-5 w-5 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                                <p className="font-medium text-foreground">Anexo</p>
                                <p className="truncate">PDF da proposta ({code || "sem código"})</p>
                            </div>
                            <a
                                href={pdfPreviewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 text-xs font-medium text-primary hover:underline"
                            >
                                Pré-visualizar
                            </a>
                        </div>

                        {sent ? (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                E-mail enviado com sucesso para {to.trim()}.
                            </div>
                        ) : null}
                    </CardContent>
                    <CardFooter className="flex flex-col gap-3 border-t bg-muted/20 sm:flex-row sm:justify-between sm:items-center">
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                            Requer SMTP em Configurações da empresa.
                        </p>
                        <Button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || !to.trim()}
                            className="w-full sm:w-auto min-w-[140px]"
                        >
                            {sending ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enviando…
                                </>
                            ) : (
                                <>
                                    <Send className="h-4 w-4 mr-2" />
                                    Enviar proposta
                                </>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
}
