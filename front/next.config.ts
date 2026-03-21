import type { NextConfig } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const url = new URL(APP_URL);

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
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
