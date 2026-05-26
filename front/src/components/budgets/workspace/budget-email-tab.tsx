"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    Mail,
    Send,
    FileText,
    Loader2,
    RefreshCw,
    Paperclip,
    ArrowDown,
    User,
    GitBranchPlus,
} from "lucide-react";
import type { Budget } from "@/types/budget-types";
import type { BudgetEmailMessageDto } from "@/actions/budget-email-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { getCustomerAction } from "@/actions/client-actions";
import {
    canCreateBudgetRevisionForBudgetAction,
    createBudgetRevisionAction,
} from "@/actions/budget-actions";
import {
    getBudgetEmailConversationAction,
    getBudgetEmailMailboxInfoAction,
    sendBudgetEmailReplyAction,
    sendBudgetProposalByEmailAction,
} from "@/actions/budget-email-actions";
import { useBudgetEmailSync } from "@/components/budgets/workspace/budget-email-sync-context";
import { useGlobalBudgetEmailSyncOptional } from "@/components/providers/global-budget-email-sync";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import {
    EmailRecipientsChipsInput,
    type EmailRecipientsChipsInputHandle,
} from "@/components/budgets/workspace/email-recipients-chips-input";
import {
    formatRecipientList,
    parseRecipientList,
    validateToAndCc,
} from "@/lib/budgets/budget-email-recipients";
import { budgetEditUrl, budgetPdfApiUrl } from "@/lib/budgets/budget-path";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BudgetEmailTabProps {
    budget: Budget;
}

function formatMessageTime(iso: string): string {
    try {
        return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
        return iso;
    }
}

/** Exibe só o texto principal em respostas (corta citação e assinatura de e-mail). */
function formatInboundBodyPreview(body: string): string {
    const trimmed = body.trim();
    if (!trimmed) return trimmed;

    const cutAt = (pattern: RegExp) => {
        const m = pattern.exec(trimmed);
        if (m && m.index > 12) return trimmed.slice(0, m.index).trim();
        return null;
    };

    return (
        cutAt(/\nSent with Proton/i) ??
        cutAt(/\nEm .+ escreveu:/i) ??
        cutAt(/\nOn .+ wrote:/i) ??
        cutAt(/\n_{3,}/) ??
        cutAt(/\n>\s/) ??
        trimmed
    );
}

function participantLabel(email: string): string {
    const local = email.split("@")[0] ?? email;
    if (local.length <= 20) return email;
    return `${local.slice(0, 18)}…@${email.split("@")[1] ?? ""}`;
}

export function BudgetEmailTab({ budget }: BudgetEmailTabProps) {
    const router = useRouter();
    const confirmDialog = useConfirmDialog();
    const { syncing, syncInbox: runSyncInbox, subscribeConversationRefresh } =
        useBudgetEmailSync();
    const globalEmailSync = useGlobalBudgetEmailSyncOptional();
    const budgetId = String(budget.id ?? "");
    const code = budget.code?.trim() || "";
    const title = budget.title?.trim() || "Proposta comercial";

    const defaultSubject = useMemo(
        () => (code ? `Proposta comercial ${code} — ${title}` : `Proposta comercial — ${title}`),
        [code, title]
    );

    const [messages, setMessages] = useState<BudgetEmailMessageDto[]>([]);
    const [toEmails, setToEmails] = useState<string[]>([]);
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const toInputRef = useRef<EmailRecipientsChipsInputHandle>(null);
    const ccInputRef = useRef<EmailRecipientsChipsInputHandle>(null);
    const [subject, setSubject] = useState(defaultSubject);
    const [message, setMessage] = useState("");
    const [includePdf, setIncludePdf] = useState(true);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [mailboxInfo, setMailboxInfo] = useState<{
        from: string;
        replyTo: string;
        imapUser: string;
        isNoReplyFrom: boolean;
    } | null>(null);
    const [canCreateRevision, setCanCreateRevision] = useState(false);
    const [revisionHint, setRevisionHint] = useState<string | null>(null);
    const [creatingRevision, setCreatingRevision] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isMountedRef = useRef(false);

    const hasConversation = messages.length > 0;
    const hasOutbound = useMemo(
        () => messages.some((m) => m.direction === "out"),
        [messages]
    );
    const pdfPreviewUrl = budgetId ? budgetPdfApiUrl(budgetId) : "#";

    const scrollToBottom = useCallback(() => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
            });
        });
    }, []);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        getBudgetEmailMailboxInfoAction().then((res) => {
            if (cancelled || !isMountedRef.current || !res.success) return;
            setMailboxInfo({
                from: res.from!,
                replyTo: res.replyTo!,
                imapUser: res.imapUser!,
                isNoReplyFrom: Boolean(res.isNoReplyFrom),
            });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const applyComposeFromMessages = useCallback(
        (list: BudgetEmailMessageDto[], participant?: string) => {
            const lastOut = [...list].reverse().find((m) => m.direction === "out");
            if (lastOut) {
                setToEmails(parseRecipientList(lastOut.to_email));
                setCcEmails(lastOut.cc_email ? parseRecipientList(lastOut.cc_email) : []);
                return;
            }
            if (participant) {
                setToEmails((prev) =>
                    prev.length > 0 ? prev : parseRecipientList(participant)
                );
            }
        },
        []
    );

    const applyConversation = useCallback(
        (res: Awaited<ReturnType<typeof getBudgetEmailConversationAction>>) => {
            if (!isMountedRef.current) return;
            if (res.success && res.messages) {
                setMessages(res.messages);
                applyComposeFromMessages(res.messages, res.participant_email);
            }
        },
        [applyComposeFromMessages]
    );

    const loadConversation = useCallback(async () => {
        const res = await getBudgetEmailConversationAction(budgetId);
        applyConversation(res);
        return res;
    }, [budgetId, applyConversation]);

    const syncInboxAndRefresh = useCallback(
        async (opts?: { notify?: boolean }) => {
            const syncRes = await runSyncInbox(opts);
            await loadConversation();
            if (!isMountedRef.current || !syncRes) return syncRes;
            setSyncError(syncRes.success ? null : syncRes.error ?? "Erro ao buscar respostas.");
            if (opts?.notify && syncRes.success && (syncRes.imported ?? 0) > 0) {
                scrollToBottom();
            }
            return syncRes;
        },
        [runSyncInbox, loadConversation, scrollToBottom]
    );

    useEffect(() => {
        return subscribeConversationRefresh(() => {
            void loadConversation().then(() => scrollToBottom());
        });
    }, [subscribeConversationRefresh, loadConversation, scrollToBottom]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const conv = await getBudgetEmailConversationAction(budgetId);
                if (cancelled) return;
                applyConversation(conv);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [budgetId, applyConversation]);

    useEffect(() => {
        if (messages.length > 0) scrollToBottom();
    }, [messages.length, scrollToBottom]);

    useEffect(() => {
        setSubject(defaultSubject);
    }, [defaultSubject]);

    const refreshRevisionEligibility = useCallback(async () => {
        const res = await canCreateBudgetRevisionForBudgetAction(budgetId);
        if (!isMountedRef.current) return;
        if (res.success) {
            setCanCreateRevision(Boolean(res.canCreate));
            setRevisionHint(res.canCreate ? null : res.hint ?? null);
        }
    }, [budgetId]);

    useEffect(() => {
        void refreshRevisionEligibility();
    }, [refreshRevisionEligibility, messages.length]);

    const handleCreateRevision = async () => {
        if (!budgetId || creatingRevision) return;
        const ok = await confirmDialog({
            title: "Abrir revisão do orçamento",
            description:
                "Criar uma nova revisão em andamento a partir desta proposta? O orçamento atual permanece finalizado; você editará a cópia com o mesmo código.",
            confirmLabel: "Criar revisão",
        });
        if (!ok) return;

        setCreatingRevision(true);
        const res = await createBudgetRevisionAction(budgetId);
        setCreatingRevision(false);

        if (res.success && res.newBudgetId) {
            toast.success("Revisão criada. Abrindo orçamento editável…");
            router.push(budgetEditUrl(res.newBudgetId));
            return;
        }
        toast.error(res.error || "Não foi possível criar a revisão.");
        void refreshRevisionEligibility();
    };

    useEffect(() => {
        let cancelled = false;
        const clientId = budget.client_id?.trim();
        if (!clientId) return;
        getCustomerAction(clientId).then((res) => {
            if (cancelled || !isMountedRef.current) return;
            if (res.success && res.data?.email?.trim()) {
                const clientEmail = res.data!.email!.trim().toLowerCase();
                setToEmails((prev) =>
                    prev.length > 0 ? prev : parseRecipientList(clientEmail)
                );
            }
        });
        return () => {
            cancelled = true;
        };
    }, [budget.client_id]);

    const handleSend = async () => {
        const toPending = toInputRef.current?.commitPending();
        if (toPending) {
            toast.error(toPending);
            return;
        }
        const ccPending = ccInputRef.current?.commitPending();
        if (ccPending) {
            toast.error(ccPending);
            return;
        }

        const parsed = validateToAndCc(toEmails, ccEmails);
        if (!parsed.ok) {
            toast.error(parsed.error);
            return;
        }

        const toPayload = formatRecipientList(parsed.to);
        const ccPayload =
            parsed.cc.length > 0 ? formatRecipientList(parsed.cc) : undefined;

        setSending(true);
        try {
            const res = hasOutbound
                ? await sendBudgetEmailReplyAction(budgetId, {
                      to: toPayload,
                      cc: ccPayload,
                      message: message.trim(),
                      subject: subject.trim() || undefined,
                  })
                : await sendBudgetProposalByEmailAction(budgetId, {
                      to: toPayload,
                      cc: ccPayload,
                      message: message.trim() || undefined,
                      subject: subject.trim() || defaultSubject,
                      includePdf,
                  });

            if (!isMountedRef.current) return;

            if (res.success) {
                toast.success(
                    hasOutbound ? "Resposta enviada." : "Proposta enviada por e-mail."
                );
                setMessage("");
                await loadConversation();
                globalEmailSync?.notifyOutboundSent();
                scrollToBottom();
                return;
            }
            toast.error(res.error || "Não foi possível enviar.");
        } finally {
            if (isMountedRef.current) setSending(false);
        }
    };

    return (
        <div className="flex flex-1 min-h-0 flex-col bg-gradient-to-b from-slate-50 to-slate-100/80">
            <div className="shrink-0 border-b bg-background/90 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Mail className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold truncate">E-mail</h2>
                        <p className="text-xs text-muted-foreground truncate">
                            {hasOutbound
                                ? "Busca automática a cada 2 min em qualquer página do sistema"
                                : hasConversation
                                  ? "Conversa iniciada — envie a proposta pelo formulário"
                                  : "Envie a proposta e acompanhe as respostas aqui"}
                        </p>
                    </div>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={syncing || loading}
                    onClick={() => syncInboxAndRefresh({ notify: true })}
                >
                    <RefreshCw
                        className={cn("h-3.5 w-3.5 mr-1.5", syncing && "animate-spin")}
                    />
                    Buscar respostas
                </Button>
            </div>

            {(syncError || mailboxInfo?.isNoReplyFrom) && (
                <div className="shrink-0 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-950">
                    <p>
                        {mailboxInfo?.isNoReplyFrom && (
                            <>
                                Envio por <strong>{mailboxInfo.from}</strong> — defina em{" "}
                                <strong>Configurações → E-mail</strong> um{" "}
                                <strong>Reply-To</strong> com caixa ativa
                                {mailboxInfo.replyTo !== mailboxInfo.from ? (
                                    <> (hoje: {mailboxInfo.replyTo})</>
                                ) : null}
                                .
                            </>
                        )}
                        {mailboxInfo?.isNoReplyFrom && syncError ? " " : null}
                        {syncError ? <>{syncError}</> : null}
                    </p>
                </div>
            )}

            <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
                <div
                    ref={scrollRef}
                    className="flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:border-r border-border/60"
                >
                    {loading ? (
                        <div className="flex h-48 items-center justify-center text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                    ) : hasConversation ? (
                        <div className="mx-auto max-w-2xl space-y-4">
                            {messages.map((msg) => {
                                const isOut = msg.direction === "out";
                                const displayBody = isOut
                                    ? msg.body_text
                                    : formatInboundBodyPreview(msg.body_text);

                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex gap-2",
                                            isOut ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {!isOut ? (
                                            <div
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600 self-end mb-0.5"
                                                title={msg.from_email}
                                            >
                                                <User className="h-4 w-4" />
                                            </div>
                                        ) : null}

                                        <div
                                            className={cn(
                                                "relative max-w-[min(85%,28rem)]",
                                                isOut ? "mr-1" : "ml-0"
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "relative rounded-2xl px-4 py-3 shadow-md",
                                                    isOut
                                                        ? "bg-primary text-primary-foreground rounded-br-sm"
                                                        : "bg-white text-foreground border border-slate-200/90 rounded-bl-sm"
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "flex flex-wrap items-center gap-2 text-[11px] mb-1.5",
                                                        isOut
                                                            ? "text-primary-foreground/85"
                                                            : "text-muted-foreground"
                                                    )}
                                                >
                                                    <span className="font-medium">
                                                        {isOut
                                                            ? "Você"
                                                            : participantLabel(msg.from_email)}
                                                    </span>
                                                    <span>·</span>
                                                    <span>{formatMessageTime(msg.sent_at)}</span>
                                                    {msg.has_pdf_attachment ? (
                                                        <>
                                                            <span>·</span>
                                                            <span className="inline-flex items-center gap-0.5">
                                                                <Paperclip className="h-3 w-3" />
                                                                PDF
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </div>
                                                {displayBody ? (
                                                    <p
                                                        className={cn(
                                                            "text-sm whitespace-pre-wrap break-words leading-relaxed",
                                                            isOut && "text-primary-foreground"
                                                        )}
                                                    >
                                                        {displayBody}
                                                    </p>
                                                ) : (
                                                    <p
                                                        className={cn(
                                                            "text-sm italic opacity-80",
                                                            isOut && "text-primary-foreground"
                                                        )}
                                                    >
                                                        (mensagem sem texto)
                                                    </p>
                                                )}
                                            </div>
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "absolute bottom-3 h-2.5 w-2.5 rotate-45",
                                                    isOut
                                                        ? "-right-1 bg-primary"
                                                        : "-left-1 bg-white border border-slate-200/90 border-t-0 border-r-0"
                                                )}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="mx-auto max-w-md text-center py-16 px-4">
                            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                <ArrowDown className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <p className="text-sm font-medium text-foreground">
                                Nenhuma mensagem ainda
                            </p>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Envie a proposta pelo formulário ao lado. As respostas do cliente
                                aparecem aqui automaticamente após o envio.
                            </p>
                        </div>
                    )}
                </div>

                <div className="shrink-0 lg:w-[380px] xl:w-[420px] overflow-y-auto border-t lg:border-t-0 bg-background/50 p-4">
                    <Card className="shadow-md border-border/80">
                        <CardHeader className="pb-3 border-b">
                            <CardTitle className="text-base">
                                {hasOutbound ? "Responder" : "Primeiro envio"}
                            </CardTitle>
                            <CardDescription>
                                {hasOutbound
                                    ? "Sua mensagem entra na mesma conversa (sem novo PDF)."
                                    : "Opcionalmente anexe o PDF da proposta."}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <EmailRecipientsChipsInput
                                ref={toInputRef}
                                id="budget-email-to"
                                label="Para"
                                emails={toEmails}
                                onChange={setToEmails}
                                disabled={sending || hasConversation}
                                placeholder="email@empresa.com"
                                reservedEmails={ccEmails}
                                hint={
                                    hasConversation
                                        ? undefined
                                        : "Digite o e-mail e pressione espaço para fixar. Vários destinatários no mesmo envio."
                                }
                            />
                            <EmailRecipientsChipsInput
                                ref={ccInputRef}
                                id="budget-email-cc"
                                label="Cc"
                                emails={ccEmails}
                                onChange={setCcEmails}
                                disabled={sending || hasConversation}
                                placeholder="copia@empresa.com"
                                reservedEmails={toEmails}
                                optional
                                hint={
                                    hasConversation
                                        ? undefined
                                        : "Cópia visível para todos (como no Outlook)."
                                }
                            />
                            {!hasOutbound ? (
                                <div className="space-y-2">
                                    <Label htmlFor="budget-email-subject">Assunto</Label>
                                    <Input
                                        id="budget-email-subject"
                                        value={subject}
                                        onChange={(e) => setSubject(e.target.value)}
                                        disabled={sending}
                                        className="h-9"
                                    />
                                </div>
                            ) : null}
                            <div className="space-y-2">
                                <Label htmlFor="budget-email-message">Mensagem</Label>
                                <Textarea
                                    id="budget-email-message"
                                    rows={5}
                                    placeholder={
                                        hasOutbound
                                            ? "Digite sua resposta…"
                                            : "Olá, segue nossa proposta…"
                                    }
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    disabled={sending}
                                    className="resize-y min-h-[100px]"
                                />
                            </div>
                            {!hasOutbound ? (
                                <label className="flex items-start gap-3 rounded-lg border bg-muted/20 px-3 py-2.5 cursor-pointer">
                                    <Checkbox
                                        checked={includePdf}
                                        onCheckedChange={(v) => setIncludePdf(v === true)}
                                        disabled={sending}
                                    />
                                    <span className="text-sm leading-snug">
                                        <span className="font-medium text-foreground">
                                            Anexar PDF da proposta
                                        </span>
                                        <span className="block text-xs text-muted-foreground mt-0.5">
                                            Igual ao da aba Impressão.{" "}
                                            <a
                                                href={pdfPreviewUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-primary hover:underline"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                Pré-visualizar
                                            </a>
                                        </span>
                                    </span>
                                </label>
                            ) : null}
                        </CardContent>
                        <div className="px-6 pb-6">
                            <Button
                                type="button"
                                className="w-full"
                                disabled={sending || toEmails.length === 0}
                                onClick={handleSend}
                            >
                                {sending ? (
                                    <>
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        Enviando…
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-2" />
                                        {hasOutbound ? "Enviar resposta" : "Enviar proposta"}
                                    </>
                                )}
                            </Button>
                            <p className="mt-3 text-[11px] text-muted-foreground text-center">
                                Respostas do cliente aparecem aqui após a leitura da caixa em
                                Configurações.
                            </p>
                        </div>
                    </Card>

                    {hasConversation ? (
                        <Card className="mt-4 shadow-sm border-amber-200/80 bg-amber-50/40">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold">
                                    Cliente pediu alteração?
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Abra uma revisão editável com o mesmo código da proposta para
                                    ajustar valores e reenviar.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="pt-0">
                                {canCreateRevision ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full border-amber-300 bg-background hover:bg-amber-50"
                                        disabled={creatingRevision}
                                        onClick={handleCreateRevision}
                                    >
                                        {creatingRevision ? (
                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                        ) : (
                                            <GitBranchPlus className="h-4 w-4 mr-2" />
                                        )}
                                        {creatingRevision
                                            ? "Criando revisão…"
                                            : "Abrir revisão do orçamento"}
                                    </Button>
                                ) : (
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {revisionHint ||
                                            "Não é possível criar outra revisão agora."}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
