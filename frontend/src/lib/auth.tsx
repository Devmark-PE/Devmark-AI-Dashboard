"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api, setCsrfToken, setUnauthorizedHandler } from "./api";
import type { Me } from "./types";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
      router.replace("/login/");
    });
    api<Me>("/auth/me")
      .then(apply)
      .catch(() => apply(null))
      .finally(() => setLoading(false));
    return () => setUnauthorizedHandler(null);
  }, [apply, router]);

  useEffect(() => {
    if (!loading && !me && !pathname.startsWith("/login")) router.replace("/login/");
  }, [loading, me, pathname, router]);

  const login = useCallback(
    async (email: string, password: string) => {
      apply(await api<Me>("/auth/login", { method: "POST", json: { email, password } }));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      apply(null);
      router.replace("/login/");
    }
  }, [apply, router]);

  return <AuthContext.Provider value={{ me, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth fuera de AuthProvider");
  return ctx;
}
