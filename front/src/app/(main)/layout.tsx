import { SidebarProvider } from "@/components/layout/sidebar-context";
import { LayoutShell } from "@/components/layout/layout-shell";
import { getSessionEmail } from "@/actions/auth-actions";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const sessionEmail = await getSessionEmail();

    return (
        <SidebarProvider>
            <LayoutShell sessionEmail={sessionEmail}>{children}</LayoutShell>
        </SidebarProvider>
    );
}
