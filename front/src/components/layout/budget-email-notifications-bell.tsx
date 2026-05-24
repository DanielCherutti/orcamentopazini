"use client";

import { useRouter } from "next/navigation";
import { Bell, Mail, CheckCheck, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGlobalBudgetEmailSyncOptional } from "@/components/providers/global-budget-email-sync";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { budgetEditEmailUrl } from "@/lib/budgets/budget-path";
import { cn } from "@/lib/utils";

export function BudgetEmailNotificationsBell() {
    const router = useRouter();
    const sync = useGlobalBudgetEmailSyncOptional();

    if (!sync) return null;

    const {
        notifications,
        unreadCount,
        popoverOpen,
        setPopoverOpen,
        markNotificationRead,
        markAllNotificationsRead,
        clearNotifications,
    } = sync;

    const handleOpen = (budgetId: string, notificationId: string) => {
        markNotificationRead(notificationId);
        setPopoverOpen(false);
        router.push(budgetEditEmailUrl(budgetId));
    };

    return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="relative rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={
                        unreadCount > 0
                            ? `${unreadCount} notificações de e-mail não lidas`
                            : "Notificações de e-mail"
                    }
                >
                    <Bell className="h-5 w-5" />
                    {unreadCount > 0 ? (
                        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                    ) : null}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-primary" />
                        <p className="text-sm font-semibold">Notificações</p>
                    </div>
                    {notifications.length > 0 ? (
                        <div className="flex items-center gap-1">
                            {unreadCount > 0 ? (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    title="Marcar todas como lidas"
                                    onClick={markAllNotificationsRead}
                                >
                                    <CheckCheck className="h-4 w-4" />
                                </Button>
                            ) : null}
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                title="Limpar lista"
                                onClick={clearNotifications}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : null}
                </div>

                {notifications.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                        Nenhuma resposta nova por enquanto.
                    </p>
                ) : (
                    <ScrollArea className="max-h-80">
                        <ul className="divide-y">
                            {notifications.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        className={cn(
                                            "w-full px-3 py-3 text-left transition-colors hover:bg-muted/60",
                                            !item.read && "bg-primary/5"
                                        )}
                                        onClick={() => handleOpen(item.budgetId, item.id)}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p
                                                className={cn(
                                                    "text-sm leading-snug",
                                                    !item.read && "font-semibold text-foreground"
                                                )}
                                            >
                                                {item.title}
                                            </p>
                                            {!item.read ? (
                                                <span
                                                    className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                                                    aria-hidden
                                                />
                                            ) : null}
                                        </div>
                                        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                            {item.body}
                                        </p>
                                        <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                                            {formatDistanceToNow(new Date(item.createdAt), {
                                                addSuffix: true,
                                                locale: ptBR,
                                            })}
                                        </p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                )}
            </PopoverContent>
        </Popover>
    );
}
