"use client";

import { useRef, useState, type InputHTMLAttributes } from "react";

type SignedNumberInputProps = Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "onBlur"
> & {
    value: number;
    onValueCommit: (value: number) => void | Promise<void>;
};

export function SignedNumberInput({ value, onValueCommit, ...props }: SignedNumberInputProps) {
    const [draft, setDraft] = useState<string | null>(null);
    const cancelCommitRef = useRef(false);

    const commit = () => {
        if (cancelCommitRef.current) {
            cancelCommitRef.current = false;
            setDraft(null);
            return;
        }
        const parsed = Number((draft ?? String(value)).trim().replace(",", "."));
        if (!Number.isFinite(parsed)) {
            setDraft(null);
            return;
        }
        setDraft(null);
        void onValueCommit(parsed);
    };

    return (
        <input
            {...props}
            type="text"
            inputMode="decimal"
            value={draft ?? String(value)}
            onFocus={() => setDraft(String(value))}
            onChange={(event) => {
                const next = event.target.value;
                if (/^-?\d*(?:[.,]\d*)?$/.test(next)) setDraft(next);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
                props.onKeyDown?.(event);
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                    cancelCommitRef.current = true;
                    event.currentTarget.blur();
                }
            }}
        />
    );
}
