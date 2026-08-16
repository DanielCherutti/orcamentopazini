import type { Metadata } from "next";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product-brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_NAME,
    template: `%s | ${PRODUCT_NAME}`,
  },
  description: PRODUCT_TAGLINE,
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{
          "--font-geist-sans": "Inter, ui-sans-serif, system-ui, sans-serif",
          "--font-geist-mono": "ui-monospace, SFMono-Regular, Menlo, monospace",
        } as React.CSSProperties}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
