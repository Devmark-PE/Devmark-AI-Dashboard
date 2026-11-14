import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SITE_URL } from "@/lib/site";

import "./globals.css";

const TITLE = "DEVMARK AI: IA privada compatible con OpenAI para tu empresa";
const DESCRIPTION =
  "Plataforma privada de IA: un modelo en servidores propios, API compatible con OpenAI, API keys por aplicación y respuestas con tus propios documentos. Habla con un asesor.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  icons: { icon: "/landing/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "es_PE",
    url: SITE_URL,
    siteName: "DEVMARK AI",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/landing/og.png", width: 1200, height: 630, alt: "DEVMARK AI: IA privada para tu empresa" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/og.png"] },
};

export const viewport: Viewport = { themeColor: "#08090c", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
