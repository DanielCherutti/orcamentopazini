"use client";

import Link from "next/link";
import { useState } from "react";
import { PanelLeftClose, LogOut, ChevronDown, ChevronRight } from "lucide-react";
import { useSidebar } from "./sidebar-context";
import { logoutAction } from "@/actions/auth-actions";

function initialsFromEmail(email: string | null | undefined): string {
    if (!email) return "?";
    const local = email.split("@")[0] ?? email;
    const parts = local.split(/[.\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
    }
    return local.slice(0, 2).toUpperCase();
}

export function Sidebar({
    sessionEmail,
}: {
    sessionEmail: string | null;
}) {
    const { collapsed, toggleSidebar } = useSidebar();
    const [productsOpen, setProductsOpen] = useState(false);

    return (
        <aside
            className={`bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col h-screen fixed left-0 top-0 z-20 transition-all duration-300 ease-in-out ${
                collapsed ? "w-0 overflow-hidden opacity-0" : "w-64 opacity-100"
            }`}
        >
            <div className="p-6 border-b border-sidebar-border flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">PAZINI</h2>
                    <p className="text-xs text-muted-foreground">Engenharia</p>
                </div>
                <button
                    onClick={toggleSidebar}
                    className="text-sidebar-foreground/70 hover:text-white transition-colors"
                    aria-label="Fechar menu lateral"
                >
                    <PanelLeftClose className="h-5 w-5" />
                </button>
            </div>

            <nav className="flex-1 p-4 space-y-1">
                {/* Produtos com submenu */}
                <div>
                    <button
                        onClick={() => setProductsOpen((v) => !v)}
                        className="w-full flex items-center justify-between px-4 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors font-medium text-sidebar-foreground/70 hover:text-white"
                    >
                        <span className="flex-1 text-left">Produtos</span>
                        {productsOpen
                            ? <ChevronDown className="h-4 w-4 shrink-0" />
                            : <ChevronRight className="h-4 w-4 shrink-0" />
                        }
                    </button>
                    {productsOpen && (
                        <div className="ml-4 mt-1 space-y-1">
                            <Link
                                href="/dashboard/products"
                                className="block px-4 py-1.5 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm text-sidebar-foreground/60 hover:text-white"
                            >
                                Cadastro de Produtos
                            </Link>
                            <Link
                                href="/dashboard/products/groups"
                                className="block px-4 py-1.5 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors text-sm text-sidebar-foreground/60 hover:text-white"
                            >
                                Cadastro de Grupos
                            </Link>
                        </div>
                    )}
                </div>

                <Link
                    href="/budgets"
                    className="block px-4 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors font-medium text-sidebar-foreground/70 hover:text-white"
                >
                    Orçamentos
                </Link>
                <Link
                    href="/customers"
                    className="block px-4 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors font-medium text-sidebar-foreground/70 hover:text-white"
                >
                    Clientes
                </Link>
                <Link
                    href="/settings"
                    className="block px-4 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors font-medium text-sidebar-foreground/70 hover:text-white"
                >
                    Configurações
                </Link>
                <Link
                    href="/settings/users"
                    className="block px-4 py-2 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors font-medium text-sidebar-foreground/70 hover:text-white"
                >
                    Usuários
                </Link>
            </nav>

            <div className="p-4 border-t border-sidebar-border">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs shrink-0">
                        {initialsFromEmail(sessionEmail)}
                    </div>
                    <div className="flex-1 text-sm min-w-0">
                        <p className="font-medium text-white truncate">
                            {sessionEmail?.split("@")[0] ?? "Usuário"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                            {sessionEmail ?? "—"}
                        </p>
                    </div>
                    <form action={logoutAction}>
                        <button
                            type="submit"
                            className="text-sidebar-foreground/70 hover:text-white transition-colors"
                            aria-label="Sair"
                            title="Sair"
                        >
                            <LogOut className="h-4 w-4" />
                        </button>
                    </form>
                </div>
            </div>
        </aside>
    );
}
