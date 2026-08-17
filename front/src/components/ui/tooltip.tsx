"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
    React.ElementRef<typeof TooltipPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
    <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
            ref={ref}
            sideOffset={sideOffset}
            className={cn(
                "z-50 max-w-96 rounded-md bg-foreground px-3 py-1.5 text-xs leading-snug text-background shadow-md",
                className,
            )}
            {...props}
        />
    </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

function TruncatedTextTooltip({
    text,
    className,
    contentClassName,
}: {
    text: string;
    className?: string;
    contentClassName?: string;
}) {
    const textRef = React.useRef<HTMLSpanElement>(null);
    const [open, setOpen] = React.useState(false);

    const handleOpenChange = (nextOpen: boolean) => {
        const textElement = textRef.current;
        setOpen(
            Boolean(
                nextOpen &&
                    textElement &&
                    textElement.scrollWidth > textElement.clientWidth,
            ),
        );
    };

    return (
        <TooltipProvider delayDuration={300}>
            <Tooltip open={open} onOpenChange={handleOpenChange}>
                <TooltipTrigger asChild>
                    <span
                        ref={textRef}
                        className={cn("min-w-0 truncate", className)}
                        tabIndex={0}
                    >
                        {text}
                    </span>
                </TooltipTrigger>
                <TooltipContent
                    side="top"
                    className={cn("max-w-[min(32rem,calc(100vw-2rem))]", contentClassName)}
                >
                    {text}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
    TruncatedTextTooltip,
};
