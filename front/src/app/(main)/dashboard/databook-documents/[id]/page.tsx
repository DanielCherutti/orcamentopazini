import { notFound } from "next/navigation";
import { getDatabookAction } from "@/actions/databook-actions";
import { listDatabookInstallationsAction } from "@/actions/databook-content-actions";
import { listDatabookMediaAction } from "@/actions/databook-media-actions";
import { DatabookWorkspace } from "@/components/databooks/databook-workspace";

export default async function DatabookDocumentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const [result, installationsResult, mediaResult] = await Promise.all([
        getDatabookAction(decodedId),
        listDatabookInstallationsAction(decodedId),
        listDatabookMediaAction(decodedId),
    ]);
    if (!result.success || !result.data) notFound();
    const document = result.data;
    return <DatabookWorkspace document={document} installations={installationsResult.data ?? []} media={mediaResult.data ?? []} />;
}
