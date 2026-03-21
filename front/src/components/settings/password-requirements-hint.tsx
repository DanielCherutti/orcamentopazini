"use client";

import { evaluatePasswordStrength } from "@/lib/password-strength";
import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    password: string;
    className?: string;
};

export function PasswordRequirementsHint({ password, className }: Props) {
    if (password.length === 0) {
        return null;
    }

    const { checks, score } = evaluatePasswordStrength(password);

    const barClass =
        score === 0
            ? "bg-muted"
            : score === 1
              ? "bg-destructive/80"
              : score === 2
                ? "bg-amber-500/90"
                : score === 3
                  ? "bg-yellow-500/80"
                  : "bg-green-600 dark:bg-green-500";

    return (
        <div className={cn("space-y-2", className)}>
            <div className="flex gap-1 h-1.5 rounded-full overflow-hidden bg-muted">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex-1 rounded-full transition-colors",
                            i <= score ? barClass : "bg-muted-foreground/15",
                        )}
                    />
                ))}
            </div>
            <ul className="space-y-1.5 text-xs" aria-live="polite">
                {checks.map((c) => (
                    <li
                        key={c.id}
                        className={cn(
                            "flex items-start gap-2",
                            c.pass
                                ? "text-green-700 dark:text-green-400"
                                : "text-muted-foreground",
                        )}
                    >
                        {c.pass ? (
                            <Check
                                className="size-3.5 shrink-0 mt-0.5"
                                aria-hidden
                            />
                        ) : (
                            <Circle
                                className="size-3.5 shrink-0 mt-0.5 opacity-50"
                                aria-hidden
                            />
                        )}
                        <span>{c.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
