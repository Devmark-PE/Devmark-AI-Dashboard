"use client";

import { ArrowLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthHeading, AuthShell } from "@/components/layout/AuthShell";
import { Button, Field, InlineError, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";

function strength(password: string): { score: number; label: string } {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  return { score, label: ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte", "Muy fuerte"][score] };
}

export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
    // Quita el token de la barra de direcciones y del historial.
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const s = strength(password);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Las contraseñas no coinciden");
    setBusy(true);
    try {
      await api("/auth/password/reset", { method: "POST", json: { token, new_password: password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {done ? (
        <>
          <div className="mb-5 grid size-11 place-items-center rounded-xl border border-good/30 bg-good/10 text-good-text">
            <CheckCircle2 className="size-5" />
          </div>
          <AuthHeading title="Contraseña actualizada" description="Por seguridad cerramos todas tus sesiones abiertas." />
          <Link href="/login/">
            <Button variant="primary" className="h-10 w-full">
              Iniciar sesión
            </Button>
          </Link>
        </>
      ) : token === null ? (
        <p className="text-sm text-fg-3">Cargando…</p>
      ) : !token ? (
        <>
          <AuthHeading title="Enlace no válido" description="Solicita un nuevo enlace desde «¿Olvidaste tu contraseña?»." />
          <Link href="/login/" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline">
            <ArrowLeft className="size-3.5" /> Volver a iniciar sesión
          </Link>
        </>
      ) : (
        <>
          <AuthHeading title="Nueva contraseña" description="Mínimo 12 caracteres. Tu gestor de contraseñas puede generarla y guardarla." />
          <form onSubmit={submit} className="space-y-4">
            <input type="text" name="username" autoComplete="username" className="hidden" aria-hidden tabIndex={-1} readOnly value="" />
            <Field label="Nueva contraseña">
              {(id) => (
                <div className="relative">
                  <Input id={id} type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 pr-10" autoFocus />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:text-fg" aria-label={show ? "Ocultar" : "Mostrar"}>
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Field>
            {password && (
              <div>
                <div className="flex gap-1" aria-hidden>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full ${i < s.score ? (s.score >= 4 ? "bg-good" : s.score >= 2 ? "bg-warning" : "bg-critical") : "bg-surface-3"}`} />
                  ))}
                </div>
                <p className="mt-1 text-xs text-fg-3">Seguridad: {s.label}</p>
              </div>
            )}
            <Field label="Repite la contraseña">
              {(id) => <Input id={id} type={show ? "text" : "password"} autoComplete="new-password" required minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="h-10" />}
            </Field>
            <InlineError message={error} />
            <Button type="submit" variant="primary" className="h-10 w-full" loading={busy}>
              Guardar contraseña
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
