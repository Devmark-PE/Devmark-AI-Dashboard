"use client";

import { ArrowRight, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/layout/Logo";
import { Button, Field, InlineError, Input } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login, me, loading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace("/");
  }, [loading, me, router]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
      setSubmitting(false);
    }
  }

  return (
    <div className="brand-glow grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="size-11" />
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-fg">DEVmark AI</h1>
          <p className="mt-1 text-sm text-fg-2">Consola de administración</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-black/20">
          <Field label="Email">
            {(id) => <Input id={id} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
          </Field>
          <Field label="Contraseña">
            {(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}
          </Field>
          <InlineError message={error} />
          <Button type="submit" variant="primary" className="w-full" loading={submitting} icon={!submitting && <ArrowRight className="size-4" />}>
            Ingresar
          </Button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-fg-3">
          <Lock className="size-3" /> Acceso solo para administradores. Las API keys no dan acceso a esta consola.
        </p>
      </div>
    </div>
  );
}
