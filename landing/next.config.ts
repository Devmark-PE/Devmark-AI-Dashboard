import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sitio estático servido por FastAPI: la portada en "/" (solo navegadores) y sus archivos en /landing.
  output: "export",
  basePath: "/landing",
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
