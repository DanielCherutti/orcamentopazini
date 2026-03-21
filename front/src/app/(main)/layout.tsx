import { SidebarProvider } from "@/components/layout/sidebar-context";
import { LayoutShell } from "@/components/layout/layout-shell";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <SidebarProvider>
            <LayoutShell>{children}</LayoutShell>
        </SidebarProvider>
    );
}
