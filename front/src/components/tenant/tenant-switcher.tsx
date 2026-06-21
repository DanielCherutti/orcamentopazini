"use client";

import { useEffect, useState, useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import {
    getActiveTenantSummaryAction,
    listMyTenantsAction,
    switchTenantAction,
} from "@/actions/tenant-actions";
import type { TenantMembership } from "@/types/tenant-types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function TenantSwitcher() {
    const [activeName, setActiveName] = useState<string | null>(null);
    const [tenants, setTenants] = useState<TenantMembership[]>([]);
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        void Promise.all([getActiveTenantSummaryAction(), listMyTenantsAction()]).then(
            ([active, list]) => {
                if (active.success && active.data) {
                    setActiveName(active.data.name);
                }
                if (list.success && list.data) {
                    setTenants(list.data);
                }
            },
        );
    }, []);

    if (tenants.length <= 1 && !activeName) return null;

    const showSwitcher = tenants.length > 1 || activeName;
    if (!showSwitcher) return null;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 max-w-[220px] truncate"
                    disabled={pending}
                >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{activeName ?? "Organização"}</span>
                    {pending ? (
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
                <p className="px-2 pb-2 text-xs font-medium text-muted-foreground">
                    Organização
                </p>
                <div className="space-y-1">
                    {tenants.map((t) => (
                        <button
                            key={t.tenantId}
                            type="button"
                            className={cn(
                                "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                                activeName === t.tenantName && "bg-muted/80",
                            )}
                            disabled={pending}
                            onClick={() => {
                                if (pending) return;
                                startTransition(async () => {
                                    const res = await switchTenantAction(t.tenantId);
                                    if (res.success) {
                                        setActiveName(t.tenantName);
                                        setOpen(false);
                                        window.location.href = "/dashboard";
                                    }
                                });
                            }}
                        >
                            <span className="flex flex-1 flex-col min-w-0">
                                <span className="font-medium truncate">{t.tenantName}</span>
                                <span className="text-xs text-muted-foreground">{t.role}</span>
                            </span>
                            {activeName === t.tenantName && (
                                <Check className="h-4 w-4 shrink-0 text-primary" />
                            )}
                        </button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
