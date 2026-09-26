import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AuthProvider } from "@/lib/auth";
import { themeInitScript } from "@/lib/theme";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Devmark AI", template: "%s · Devmark AI" },
  description: "Plataforma privada de IA: modelos, API keys, aplicaciones, uso y logs.",
  robots: { index: false, follow: false },
  icons: { icon: "/dashboard/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#08090c", colorScheme: "dark light" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
