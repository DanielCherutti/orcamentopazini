"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

const SupportModeLayoutContext = createContext(false);

export function useSupportModeLayout() {
    return useContext(SupportModeLayoutContext);
}

/** Reserva altura do banner via CSS var --support-banner-height no :root. */
export function SupportModeLayoutProvider({
    active,
    banner,
    children,
}: {
    active: boolean;
    banner: ReactNode;
    children: ReactNode;
}) {
    const bannerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const root = document.documentElement;

        if (!active) {
            root.style.removeProperty("--support-banner-height");
            return;
        }

        const el = bannerRef.current;
        if (!el) return;

        const sync = () => {
            root.style.setProperty("--support-banner-height", `${el.offsetHeight}px`);
        };

        sync();
        const ro = new ResizeObserver(sync);
        ro.observe(el);
        window.addEventListener("resize", sync);

        return () => {
            ro.disconnect();
            window.removeEventListener("resize", sync);
            root.style.removeProperty("--support-banner-height");
        };
    }, [active]);

    if (!active) {
        return (
            <SupportModeLayoutContext.Provider value={false}>{children}</SupportModeLayoutContext.Provider>
        );
    }

    return (
        <SupportModeLayoutContext.Provider value={true}>
            <div ref={bannerRef} className="sticky top-0 z-[60] w-full shrink-0">
                {banner}
            </div>
            {children}
        </SupportModeLayoutContext.Provider>
    );
}
