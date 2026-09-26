import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";
const apiTarget = process.env.DEVMARK_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // Sitio estático servido por FastAPI (o Nginx) en /dashboard: sin Node en el servidor.
  output: isDev ? undefined : "export",
  basePath: "/dashboard",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // En desarrollo, /api/admin se redirige al FastAPI local.
  ...(isDev
    ? {
        async rewrites() {
          return [{ source: "/api/admin/:path*", destination: `${apiTarget}/api/admin/:path*`, basePath: false }];
        },
      }
    : {}),
};

export default nextConfig;
