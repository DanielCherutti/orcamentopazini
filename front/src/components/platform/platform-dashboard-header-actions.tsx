"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { CreateOrganizationDialog } from "@/components/platform/create-organization-dialog";
import { ExportOrganizationsCsvButton } from "@/components/platform/export-organizations-csv-button";
import { Button } from "@/components/ui/button";
import { usePlatformPermissions } from "@/components/platform/platform-permissions-context";

export function PlatformDashboardHeaderActions() {
    const [createOpen, setCreateOpen] = useState(false);
    const { can } = usePlatformPermissions();

    return (
        <>
            <ExportOrganizationsCsvButton />
            <Button variant="outline" asChild>
                <Link href="/platform/licenses">Planos e preços</Link>
            </Button>
            <Button variant="outline" asChild>
                <Link href="/platform/organizations">Ver organizações</Link>
            </Button>
            {can("orgs.write") && (
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Nova organização
                </Button>
            )}
            <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
        </>
    );
}
