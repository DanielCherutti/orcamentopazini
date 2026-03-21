import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Demo Anotador",
};

export default function AnnotatorDemoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
