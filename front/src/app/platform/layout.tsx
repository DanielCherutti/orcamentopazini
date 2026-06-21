import { redirect } from "next/navigation";
import { getSessionEmail } from "@/actions/auth-actions";
import { getSessionContext } from "@/lib/tenant-context";
import { PlatformShell } from "@/components/platform/platform-shell";

export default async function PlatformLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const ctx = await getSessionContext();
    if (!ctx?.platformMode) {
        redirect("/dashboard");
    }

    const email = await getSessionEmail();

    return <PlatformShell sessionEmail={email}>{children}</PlatformShell>;
}
