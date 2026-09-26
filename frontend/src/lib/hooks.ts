"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "./api";

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/** GET con estado de carga/error y recarga opcional cada `refreshMs`. */
export function useResource<T>(path: string | null, refreshMs?: number): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const current = useRef(path);
  current.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    try {
      const result = await api<T>(path);
      if (current.current === path) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (current.current === path) setError(err instanceof ApiError ? err.message : "Error inesperado");
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(true);
    void load();
    if (!refreshMs) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [load, refreshMs]);

  return { data, error, loading, reload: load };
}
