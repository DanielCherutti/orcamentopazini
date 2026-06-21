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

    const outlineClass =
        "rounded-lg border-violet-300/30 bg-violet-500/15 text-violet-50 hover:bg-violet-500/25 hover:text-white";

    return (
        <>
            <ExportOrganizationsCsvButton />
            <Button variant="outline" className={outlineClass} asChild>
                <Link href="/platform/licenses">Planos</Link>
            </Button>
            <Button variant="outline" className={outlineClass} asChild>
                <Link href="/platform/organizations">Organizações</Link>
            </Button>
            {can("orgs.write") ? (
                <Button
                    className="rounded-lg bg-white font-bold text-violet-950 hover:bg-violet-100"
                    onClick={() => setCreateOpen(true)}
                >
                    <Plus className="h-4 w-4" />
                    Nova org
                </Button>
            ) : null}
            <CreateOrganizationDialog open={createOpen} onOpenChange={setCreateOpen} />
        </>
    );
}
