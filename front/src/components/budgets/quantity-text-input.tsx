"use client";

import { useEffect, useState } from "react";
import type { FocusEventHandler, KeyboardEventHandler, MouseEventHandler } from "react";
import { formatQuantityInputDisplay, parseLocaleNumberInput } from "@/lib/locale-number";

type QuantityTextInputProps = {
    value: number;
    onValueChange: (n: number) => void;
    min?: number;
    disabled?: boolean;
    className?: string;
    id?: string;
    "aria-label"?: string;
    onClick?: MouseEventHandler<HTMLInputElement>;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
    onBlur?: FocusEventHandler<HTMLInputElement>;
};

/**
 * Campo de quantidade com suporte a vírgula decimal (pt-BR) e decimais.
 * Evita o comportamento de {@link HTMLInputElement.type} `"number"` que ignora ou trunca `5,5`.
 */
export function QuantityTextInput({
    value,
    onValueChange,
    min = 0.000001,
    disabled,
    className,
    id,
    "aria-label": ariaLabel,
    onClick,
    onKeyDown,
    onBlur: onBlurProp,
}: QuantityTextInputProps) {
    const [text, setText] = useState(() => formatQuantityInputDisplay(value));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) {
            setText(formatQuantityInputDisplay(value));
        }
    }, [value, focused]);

    const commit = () => {
        const n = parseLocaleNumberInput(text);
        if (!Number.isFinite(n) || n < min) {
            setText(formatQuantityInputDisplay(value));
            return;
        }
        onValueChange(n);
        setText(formatQuantityInputDisplay(n));
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            id={id}
            aria-label={ariaLabel}
            disabled={disabled}
            className={className}
            value={text}
            onFocus={() => setFocused(true)}
            onBlur={(e) => {
                setFocused(false);
                commit();
                onBlurProp?.(e);
            }}
            onChange={(e) => {
                const raw = e.target.value;
                setText(raw);
                const n = parseLocaleNumberInput(raw);
                if (Number.isFinite(n) && n >= min) {
                    onValueChange(n);
                }
            }}
            onClick={onClick}
            onKeyDown={onKeyDown}
        />
    );
}
