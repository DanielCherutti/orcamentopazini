import type { NextConfig } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const url = new URL(APP_URL);

const nextConfig: NextConfig = {
  output: "standalone",
  /** Evita empacotar o motor PDF no bundle do Next (quebra renderToBuffer na rota API). */
  serverExternalPackages: [
    "@react-pdf/renderer",
    "@react-pdf/render",
    "@react-pdf/pdfkit",
    "@react-pdf/layout",
    "@react-pdf/font",
    "@react-pdf/reconciler",
    "@react-pdf/primitives",
    "@react-pdf/fns",
    "@react-pdf/types",
    "@react-pdf/textkit",
    "yoga-layout",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
    /** Upload de pacotes .pazini.zip na rota /api/budgets/import */
    proxyClientMaxBodySize: "250mb",
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: url.hostname,
        port: url.port || "3000",
        pathname: "/api/uploads/**",
      },
    ],
  },
};

export default nextConfig;
