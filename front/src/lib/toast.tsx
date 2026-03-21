import { toast as sonnerToast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";

/**
 * Custom toast wrapper with pre-configured variants
 * Applies frontend-specialist principles: Sharp geometry, no purple, clear feedback
 */

type ToastVariant = "success" | "error" | "warning" | "info";

interface ToastOptions {
    description?: string;
    duration?: number;
}

const variantConfig = {
    success: {
        icon: CheckCircle2,
        className: "text-green-600",
    },
    error: {
        icon: XCircle,
        className: "text-red-600",
    },
    warning: {
        icon: AlertTriangle,
        className: "text-amber-600",
    },
    info: {
        icon: Info,
        className: "text-blue-600",
    },
};

function createToast(
    variant: ToastVariant,
    message: string,
    options?: ToastOptions
) {
    const config = variantConfig[variant];
    const Icon = config.icon;

    return sonnerToast(message, {
        description: options?.description,
        duration: options?.duration || 4000,
        icon: <Icon className={`h-5 w-5 ${config.className}`} />,
        className: "rounded-sm", // Sharp geometry (2-4px)
    });
}

export const toast = {
    success: (message: string, options?: ToastOptions) =>
        createToast("success", message, options),
    error: (message: string, options?: ToastOptions) =>
        createToast("error", message, options),
    warning: (message: string, options?: ToastOptions) =>
        createToast("warning", message, options),
    info: (message: string, options?: ToastOptions) =>
        createToast("info", message, options),
};
