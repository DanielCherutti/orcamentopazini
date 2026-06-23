"use client";

import { Moon, Sun } from "lucide-react";
import { useTenantTheme } from "@/components/theme/tenant-theme-provider";
import { cn } from "@/lib/utils";

export function TenantThemeToggle({ className }: { className?: string }) {
    const { appearance, toggleAppearance, ready } = useTenantTheme();
    const isLight = appearance === "light";

    return (
        <button
            type="button"
            onClick={toggleAppearance}
            disabled={!ready}
            className={cn(
                "shell-chrome-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
                className,
            )}
            aria-label={isLight ? "Ativar tema escuro" : "Ativar tema claro"}
            title={isLight ? "Tema escuro" : "Tema claro"}
        >
            {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </button>
    );
}
