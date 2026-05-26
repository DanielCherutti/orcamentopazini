"use client";

import {
    forwardRef,
    useCallback,
    useImperativeHandle,
    useRef,
    useState,
    type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
    isValidRecipientEmail,
    parseRecipientList,
    dedupeRecipientEmails,
} from "@/lib/budgets/budget-email-recipients";
import { cn } from "@/lib/utils";

export type EmailRecipientsChipsInputHandle = {
    /** Confirma texto digitado sem dar espaço; retorna erro ou null. */
    commitPending: () => string | null;
};

type EmailRecipientsChipsInputProps = {
    id: string;
    label: string;
    emails: string[];
    onChange: (emails: string[]) => void;
    disabled?: boolean;
    placeholder?: string;
    hint?: string;
    /** E-mails já usados no outro campo (Para/Cc) — não repetir. */
    reservedEmails?: string[];
    optional?: boolean;
};

function normalizeToken(raw: string): string {
    return raw.trim().replace(/^[,;\s]+|[,;\s]+$/g, "").toLowerCase();
}

export const EmailRecipientsChipsInput = forwardRef<
    EmailRecipientsChipsInputHandle,
    EmailRecipientsChipsInputProps
>(function EmailRecipientsChipsInput(
    {
    id,
    label,
    emails,
    onChange,
    disabled = false,
    placeholder = "digite@email.com",
    hint,
    reservedEmails = [],
    optional = false,
    },
    ref
) {
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const reserved = new Set(reservedEmails.map((e) => e.trim().toLowerCase()));

    const addEmails = useCallback(
        (incoming: string[]) => {
            const valid = incoming.filter(isValidRecipientEmail);
            const invalid = incoming.filter((e) => e && !isValidRecipientEmail(e));
            if (invalid.length > 0) {
                setError(
                    invalid.length === 1
                        ? `E-mail inválido: ${invalid[0]}`
                        : `E-mails inválidos: ${invalid.join(", ")}`
                );
            } else {
                setError(null);
            }
            if (valid.length === 0) return false;

            const merged = dedupeRecipientEmails([...emails, ...valid], reserved);
            if (merged.length === emails.length) {
                setError("Este e-mail já foi adicionado.");
                return false;
            }
            onChange(merged);
            return true;
        },
        [emails, onChange, reserved]
    );

    const commitDraft = useCallback((): boolean => {
        const token = normalizeToken(draft);
        if (!token) return true;
        if (!isValidRecipientEmail(token)) {
            setError(`E-mail inválido: ${token}`);
            return false;
        }
        const ok = addEmails([token]);
        if (ok) setDraft("");
        return ok;
    }, [addEmails, draft]);

    useImperativeHandle(
        ref,
        () => ({
            commitPending: () => {
                const token = normalizeToken(draft);
                if (!token) return null;
                if (!isValidRecipientEmail(token)) {
                    const msg = `E-mail inválido: ${token}`;
                    setError(msg);
                    return msg;
                }
                if (reserved.has(token) || emails.includes(token)) {
                    const msg = "Este e-mail já foi adicionado.";
                    setError(msg);
                    return msg;
                }
                addEmails([token]);
                setDraft("");
                return null;
            },
        }),
        [addEmails, draft, emails, reserved]
    );

    const removeAt = (index: number) => {
        onChange(emails.filter((_, i) => i !== index));
        setError(null);
    };

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return;

        if (e.key === " " || e.key === "Enter" || e.key === "," || e.key === ";") {
            e.preventDefault();
            commitDraft();
            return;
        }

        if (e.key === "Backspace" && !draft && emails.length > 0) {
            onChange(emails.slice(0, -1));
            setError(null);
        }
    };

    const onPaste = (text: string) => {
        const parsed = parseRecipientList(text);
        if (parsed.length > 0) addEmails(parsed);
        setDraft("");
    };

    const onBlur = () => {
        if (draft.trim()) commitDraft();
    };

    return (
        <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <div
                className={cn(
                    "flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-xs transition-colors",
                    "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]",
                    disabled && "cursor-not-allowed opacity-60",
                    error && "border-destructive focus-within:ring-destructive/20"
                )}
                onClick={() => inputRef.current?.focus()}
            >
                {emails.map((email, index) => (
                    <span
                        key={`${email}-${index}`}
                        className="inline-flex max-w-full items-center gap-1 rounded-sm bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                    >
                        <span className="truncate">{email}</span>
                        {!disabled ? (
                            <button
                                type="button"
                                className="rounded-sm hover:bg-primary/20"
                                aria-label={`Remover ${email}`}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeAt(index);
                                }}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        ) : null}
                    </span>
                ))}
                {!disabled ? (
                    <input
                        ref={inputRef}
                        id={id}
                        type="text"
                        autoComplete="off"
                        value={draft}
                        disabled={disabled}
                        placeholder={emails.length === 0 ? placeholder : ""}
                        className="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-sm outline-none placeholder:text-muted-foreground"
                        onChange={(e) => {
                            setDraft(e.target.value);
                            if (error) setError(null);
                        }}
                        onKeyDown={onKeyDown}
                        onBlur={onBlur}
                        onPaste={(e) => {
                            const text = e.clipboardData.getData("text");
                            if (text.includes(",") || text.includes(";") || text.includes(" ")) {
                                e.preventDefault();
                                onPaste(text);
                            }
                        }}
                    />
                ) : null}
            </div>
            {error ? (
                <p className="text-[11px] text-destructive">{error}</p>
            ) : hint ? (
                <p className="text-[11px] text-muted-foreground leading-snug">{hint}</p>
            ) : optional ? (
                <p className="text-[11px] text-muted-foreground leading-snug">Opcional.</p>
            ) : null}
        </div>
    );
});
