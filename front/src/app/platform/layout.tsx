import { redirect } from "next/navigation";
import { getSessionEmail } from "@/actions/auth-actions";
import { getSessionContext } from "@/lib/tenant-context";
import { PlatformShell } from "@/components/platform/platform-shell";
import { PlatformPermissionsProvider } from "@/components/platform/platform-permissions-context";

export default async function PlatformLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const ctx = await getSessionContext();
    if (!ctx?.platformMode || !ctx.platformRole) {
        redirect("/dashboard");
    }

    const email = await getSessionEmail();

    return (
        <PlatformPermissionsProvider role={ctx.platformRole}>
            <PlatformShell sessionEmail={email} platformRole={ctx.platformRole}>
                {children}
            </PlatformShell>
        </PlatformPermissionsProvider>
    );
}
