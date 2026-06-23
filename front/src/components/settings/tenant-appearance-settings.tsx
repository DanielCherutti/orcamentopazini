"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTenantTheme } from "@/components/theme/tenant-theme-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TenantAppearance } from "@/lib/tenant-theme";

const OPTIONS: {
    value: TenantAppearance;
    label: string;
    description: string;
    icon: typeof Moon;
}[] = [
    {
        value: "dark",
        label: "Escuro",
        description: "Command Deck — fundo escuro com painéis em destaque.",
        icon: Moon,
    },
    {
        value: "light",
        label: "Claro",
        description: "Mesmo padrão ops — canvas claro, rail e header escuros.",
        icon: Sun,
    },
];

export function TenantAppearanceSettings() {
    const { appearance, setAppearance, ready } = useTenantTheme();

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5 text-primary" />
                    Aparência
                </CardTitle>
                <CardDescription>
                    Escolha como o painel é exibido neste navegador. A preferência fica salva
                    localmente no seu dispositivo.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                    {OPTIONS.map(({ value, label, description, icon: Icon }) => {
                        const selected = appearance === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                disabled={!ready}
                                onClick={() => setAppearance(value)}
                                className={cn(
                                    "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all",
                                    selected
                                        ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                                        : "border-border hover:border-primary/40 hover:bg-muted/40",
                                    !ready && "opacity-50",
                                )}
                                aria-pressed={selected}
                            >
                                <span className="flex items-center gap-2 font-semibold">
                                    <Icon className="h-4 w-4 text-primary" />
                                    {label}
                                </span>
                                <span className="text-sm text-muted-foreground">{description}</span>
                            </button>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
