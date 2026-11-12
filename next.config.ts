import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "192.168.1.59"],
  experimental: {
    proxyClientMaxBodySize: "25mb",
  },
  output: "standalone",
  // Both packages are only used by Node.js server routes. Keeping them out of
  // the web bundle avoids Webpack trying to emit PDFKit's ICC profile as a
  // browser asset during the production build.
  serverExternalPackages: ["ffmpeg-static", "pdfkit"],
  outputFileTracingIncludes: {
    "/api/admin/uploads": ["./node_modules/ffmpeg-static/ffmpeg", "./node_modules/ffmpeg-static/ffmpeg.exe"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "original.negocioserp.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

export default nextConfig;
