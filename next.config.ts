import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.1.59"],
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "original.negocioserp.com",
      },
    ],
  },
};

export default nextConfig;
