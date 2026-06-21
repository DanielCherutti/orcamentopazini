import { SelectTenantForm } from "@/components/tenant/select-tenant-form";

export default async function SelectTenantPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string }>;
}) {
    const params = await searchParams;
    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-muted/40 to-background p-6">
            <SelectTenantForm errorCode={params.error ?? null} />
        </div>
    );
}
