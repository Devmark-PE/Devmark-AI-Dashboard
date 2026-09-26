"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, setCsrfToken, setUnauthorizedHandler } from "./api";
import type { Me, MfaChallenge } from "./types";

// Páginas accesibles sin sesión.
const PUBLIC_PATHS = ["/login", "/reset-password"];
const isPublicPath = (path: string) => PUBLIC_PATHS.some((p) => path.startsWith(p));

export type LoginResult = { status: "ok" } | { status: "mfa"; token: string };

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string, remember: boolean) => Promise<LoginResult>;
  verifyMfa: (token: string, second: { code?: string; recovery_code?: string }) => Promise<void>;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const apply = useCallback((value: Me | null) => {
    setCsrfToken(value?.csrf_token ?? null);
    setMe(value);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      apply(null);
      // En páginas públicas (login, restablecer contraseña) un 401 es lo esperado: no se redirige.
      if (!isPublicPath(window.location.pathname.replace(/^\/dashboard/, ""))) router.replace("/login/");
    });
    api<Me>("/auth/me")
      .then(apply)
      .catch(() => apply(null))
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [apply, router]);

  useEffect(() => {
    if (!loading && !me && !isPublicPath(pathname)) router.replace("/login/");
  }, [loading, me, pathname, router]);

  const login = useCallback(
    async (email: string, password: string, remember: boolean): Promise<LoginResult> => {
      const result = await api<Me | MfaChallenge>("/auth/login", { method: "POST", json: { email, password, remember } });
      if ("mfa_required" in result) return { status: "mfa", token: result.mfa_token };
      apply(result);
      return { status: "ok" };
    },
    [apply],
  );

  const verifyMfa = useCallback(
    async (token: string, second: { code?: string; recovery_code?: string }) => {
      apply(await api<Me>("/auth/login/2fa", { method: "POST", json: { mfa_token: token, ...second } }));
    },
    [apply],
  );

  const refresh = useCallback(async () => {
    apply(await api<Me>("/auth/me"));
  }, [apply]);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      apply(null);
      router.replace("/login/");
    }
  }, [apply, router]);

  return <AuthContext.Provider value={{ me, loading, login, verifyMfa, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
