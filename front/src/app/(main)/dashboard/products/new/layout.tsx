import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Novo Produto",
};

export default function NewProductLayout({ children }: { children: React.ReactNode }) {
    return children;
}
