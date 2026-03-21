import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: "text" | "circle" | "rectangle";
}

/**
 * Skeleton component with shimmer animation
 * Used for loading states across the application
 */
export function Skeleton({
    className,
    variant = "rectangle",
    ...props
}: SkeletonProps) {
    const variantClasses = {
        text: "h-4 w-full",
        circle: "rounded-full",
        rectangle: "rounded-sm", // Sharp geometry
    };

    return (
        <div
            className={cn(
                "animate-pulse bg-muted",
                "relative overflow-hidden",
                "before:absolute before:inset-0",
                "before:-translate-x-full",
                "before:animate-[shimmer_1.5s_infinite]",
                "before:bg-gradient-to-r",
                "before:from-transparent before:via-white/10 before:to-transparent",
                variantClasses[variant],
                className
            )}
            {...props}
        />
    );
}
