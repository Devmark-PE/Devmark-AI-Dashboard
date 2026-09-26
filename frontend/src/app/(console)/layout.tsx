"use client";

import type { ReactNode } from "react";

import { Shell } from "@/components/layout/Shell";
import { LoadingState } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { me, loading } = useAuth();
  if (loading || !me) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingState label="Verificando sesión…" />
      </div>
    );
  }
  return <Shell>{children}</Shell>;
}
