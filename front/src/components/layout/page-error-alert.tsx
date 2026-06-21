import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DashboardPageShell } from "@/components/layout/dashboard-page-shell";
import { PlatformPageShell } from "@/components/layout/platform-page-shell";

type BackLink = {
    href: string;
    label: string;
};

type Props = {
    title?: string;
    message: string;
    backLink?: BackLink;
};

export function PageErrorAlert({
    title = "Não foi possível carregar",
    message,
    backLink,
}: Props) {
    return (
        <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{title}</AlertTitle>
            <AlertDescription className="space-y-3">
                <p>{message}</p>
                {backLink ? (
                    <Button variant="outline" size="sm" className="h-8" asChild>
                        <Link href={backLink.href}>{backLink.label}</Link>
                    </Button>
                ) : null}
            </AlertDescription>
        </Alert>
    );
}

export function TenantPageError({
    pageTitle,
    message,
    backLink,
}: {
    pageTitle: string;
    message: string;
    backLink?: BackLink;
}) {
    return (
        <DashboardPageShell title={pageTitle}>
            <PageErrorAlert message={message} backLink={backLink} />
        </DashboardPageShell>
    );
}

export function PlatformPageError({
    pageTitle,
    message,
    backLink,
}: {
    pageTitle: string;
    message: string;
    backLink?: BackLink;
}) {
    return (
        <PlatformPageShell title={pageTitle}>
            <PageErrorAlert message={message} backLink={backLink} />
        </PlatformPageShell>
    );
}
