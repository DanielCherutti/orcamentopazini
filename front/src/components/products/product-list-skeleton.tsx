import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loader for product list table
 * Shows 10 skeleton rows matching the table structure
 */
export function ProductListSkeleton() {
    return (
        <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
                <div
                    key={i}
                    className="flex items-center gap-4 p-4 border border-border rounded-sm"
                >
                    {/* Code */}
                    <Skeleton className="h-4 w-24" />

                    {/* Description */}
                    <Skeleton className="h-4 flex-1" />

                    {/* Unit */}
                    <Skeleton className="h-4 w-16" />

                    {/* Equipment Price */}
                    <Skeleton className="h-4 w-24" />

                    {/* Assembly Price */}
                    <Skeleton className="h-4 w-24" />

                    {/* Actions */}
                    <div className="flex gap-2">
                        <Skeleton className="h-8 w-8" />
                        <Skeleton className="h-8 w-8" />
                    </div>
                </div>
            ))}
        </div>
    );
}
