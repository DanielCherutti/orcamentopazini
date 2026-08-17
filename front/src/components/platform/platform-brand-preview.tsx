"use client";

import { OrgAvatar } from "@/components/platform/platform-utils";

type Props = {
    companyName: string;
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
};

export function PlatformBrandPreview({
    companyName,
    logoUrl,
    primaryColor,
    secondaryColor,
}: Props) {
    return (
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm ring-1 ring-black/[0.03]">
            <div
                className="relative px-5 py-6"
                style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${primaryColor}dd 55%, ${secondaryColor}33 100%)`,
                }}
            >
                <div
                    className="absolute inset-0 opacity-30"
                    style={{
                        background:
                            "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.35), transparent 50%)",
                    }}
                    aria-hidden
                />
                <div className="relative flex items-center gap-3">
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoUrl}
                            alt=""
                            className="h-12 w-12 rounded-xl bg-white/90 object-contain p-1 shadow-sm"
                        />
                    ) : (
                        <OrgAvatar name={companyName} size="lg" className="ring-2 ring-white/20" />
                    )}
                    <div>
                        <p className="text-lg font-bold text-white drop-shadow-sm">
                            {companyName || "Nome da empresa"}
                        </p>
                        <p className="text-xs text-white/75">Portal operacional</p>
                    </div>
                </div>
            </div>
            <div className="space-y-3 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Prévia do tema
                </p>
                <div className="flex gap-2">
                    <div
                        className="h-10 flex-1 rounded-lg shadow-inner ring-1 ring-black/5"
                        style={{ backgroundColor: primaryColor }}
                        title="Primária"
                    />
                    <div
                        className="h-10 flex-1 rounded-lg shadow-inner ring-1 ring-black/5"
                        style={{ backgroundColor: secondaryColor }}
                        title="Secundária"
                    />
                </div>
                <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                    <div className="mb-2 flex items-center gap-2">
                        <div
                            className="h-2 w-8 rounded-full"
                            style={{ backgroundColor: secondaryColor }}
                        />
                        <div className="h-2 flex-1 rounded bg-muted" />
                    </div>
                    <div className="space-y-1.5">
                        <div className="h-2 w-full rounded bg-muted" />
                        <div className="h-2 w-4/5 rounded bg-muted" />
                    </div>
                    <button
                        type="button"
                        className="mt-3 w-full rounded-md py-1.5 text-xs font-semibold text-white shadow-sm"
                        style={{ backgroundColor: primaryColor }}
                        tabIndex={-1}
                    >
                        Botão primário
                    </button>
                </div>
            </div>
        </div>
    );
}
