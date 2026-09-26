"use client";

import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthHeading, AuthShell } from "@/components/layout/AuthShell";
import { Button, Field, InlineError, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Step = "credentials" | "mfa" | "forgot" | "forgot-sent";

function errorText(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

/** Guarda la contraseña en el gestor del navegador cuando está disponible (Chrome/Edge). */
async function storeCredential(form: HTMLFormElement | null) {
  try {
    const Ctor = (window as unknown as { PasswordCredential?: new (form: HTMLFormElement) => Credential }).PasswordCredential;
    if (form && Ctor && navigator.credentials?.store) await navigator.credentials.store(new Ctor(form));
  } catch {
    /* el usuario rechazó guardarla o el navegador no lo soporta */
  }
}

export default function LoginPage() {
  const { login, verifyMfa, me, loading } = useAuth();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mfaToken, setMfaToken] = useState("");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [resetByEmail, setResetByEmail] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && me) router.replace("/");
  }, [loading, me, router]);

  useEffect(() => {
    api<{ password_reset_email: boolean }>("/auth/options")
      .then((o) => setResetByEmail(o.password_reset_email))
      .catch(() => setResetByEmail(false));
  }, []);

  function go(next: Step) {
    setError(null);
    setStep(next);
  }

  async function submitCredentials(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await login(email, password, remember);
      await storeCredential(formRef.current);
      if (result.status === "mfa") {
        setMfaToken(result.token);
        setCode("");
        go("mfa");
      } else {
        router.replace("/");
      }
    } catch (err) {
      setError(errorText(err, "No se pudo iniciar sesión"));
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyMfa(mfaToken, useRecovery ? { recovery_code: code } : { code });
      router.replace("/");
    } catch (err) {
      const message = errorText(err, "Código incorrecto");
      setError(message);
      if (message.includes("expiró")) {
        setPassword("");
        go("credentials");
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api("/auth/password/forgot", { method: "POST", json: { email } });
      go("forgot-sent");
    } catch (err) {
      setError(errorText(err, "No se pudo enviar el enlace"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {step === "credentials" && (
        <>
          <AuthHeading title="Iniciar sesión" description="Consola de administración de Devmark AI." />
          <form ref={formRef} onSubmit={submitCredentials} method="post" action="#" className="space-y-4" autoComplete="on">
            <Field label="Email">
              {(id) => (
                <div className="relative">
                  <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
                  <Input id={id} name="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className="h-10 pl-9" placeholder="tu@empresa.com" />
                </div>
              )}
            </Field>
            <Field label="Contraseña">
              {(id) => (
                <div className="relative">
                  <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-3" />
                  <Input
                    id={id}
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-10 pr-10 pl-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:text-fg"
                    aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              )}
            </Field>
            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-2">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--accent)]" />
                Mantener sesión iniciada
              </label>
              <button type="button" onClick={() => go("forgot")} className="text-[13px] font-medium text-accent-strong hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <InlineError message={error} />
            <Button type="submit" variant="primary" className="h-10 w-full" loading={busy} icon={!busy && <ArrowRight className="size-4" />}>
              Ingresar
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-fg-3">Solo administradores. Una API key no da acceso a esta consola.</p>
        </>
      )}

      {step === "mfa" && (
        <>
          <div className="mb-5 grid size-11 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent-strong">
            {useRecovery ? <KeyRound className="size-5" /> : <ShieldCheck className="size-5" />}
          </div>
          <AuthHeading
            title="Verificación en dos pasos"
            description={useRecovery ? "Escribe uno de tus códigos de recuperación. Cada código sirve una sola vez." : "Escribe el código de 6 dígitos de tu app de autenticación."}
          />
          <form onSubmit={submitMfa} className="space-y-4">
            {useRecovery ? (
              <Field label="Código de recuperación">
                {(id) => <Input id={id} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="abcde-12345" className="h-11 font-mono tracking-wider" autoComplete="off" />}
              </Field>
            ) : (
              <Field label="Código">
                {(id) => (
                  <Input
                    id={id}
                    autoFocus
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]{6,7}"
                    maxLength={7}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                    placeholder="000000"
                    className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
                  />
                )}
              </Field>
            )}
            <InlineError message={error} />
            <Button type="submit" variant="primary" className="h-10 w-full" loading={busy} disabled={!useRecovery && code.length !== 6}>
              Verificar
            </Button>
          </form>
          <div className="mt-5 flex items-center justify-between text-[13px]">
            <button type="button" onClick={() => go("credentials")} className="inline-flex items-center gap-1 text-fg-3 hover:text-fg">
              <ArrowLeft className="size-3.5" /> Volver
            </button>
            <button
              type="button"
              onClick={() => {
                setUseRecovery((v) => !v);
                setCode("");
                setError(null);
              }}
              className="font-medium text-accent-strong hover:underline"
            >
              {useRecovery ? "Usar código de la app" : "¿Perdiste el teléfono? Usa un código de recuperación"}
            </button>
          </div>
        </>
      )}

      {step === "forgot" && (
        <>
          <AuthHeading
            title="Recuperar contraseña"
            description={resetByEmail === false ? "La recuperación por email no está configurada en el servidor." : "Te enviaremos un enlace para crear una nueva contraseña."}
          />
          {resetByEmail === false ? (
            <div className="space-y-3 rounded-xl border border-line bg-surface p-4 text-[13px] text-fg-2">
              <p>Un administrador puede restablecerla desde el servidor:</p>
              <code className="block rounded-lg bg-bg-subtle p-2.5 font-mono text-xs text-fg">venv/bin/python -m app.cli reset-password --email tu@correo.com</code>
              <p className="text-fg-3">Para activar la recuperación por email, configura SMTP en el .env (ver docs/PENDIENTES.md).</p>
            </div>
          ) : (
            <form onSubmit={submitForgot} className="space-y-4">
              <Field label="Email">
                {(id) => <Input id={id} type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />}
              </Field>
              <InlineError message={error} />
              <Button type="submit" variant="primary" className="h-10 w-full" loading={busy}>
                Enviar enlace
              </Button>
            </form>
          )}
          <button type="button" onClick={() => go("credentials")} className="mt-5 inline-flex items-center gap-1 text-[13px] text-fg-3 hover:text-fg">
            <ArrowLeft className="size-3.5" /> Volver a iniciar sesión
          </button>
        </>
      )}

      {step === "forgot-sent" && (
        <>
          <div className="mb-5 grid size-11 place-items-center rounded-xl border border-good/30 bg-good/10 text-good-text">
            <Mail className="size-5" />
          </div>
          <AuthHeading title="Revisa tu correo" description={<>Si <b className="text-fg">{email}</b> tiene una cuenta, recibirás un enlace válido por 30 minutos.</>} />
          <p className="text-[13px] text-fg-3">¿No llega? Revisa la carpeta de spam o vuelve a intentarlo en unos minutos.</p>
          <button type="button" onClick={() => go("credentials")} className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline">
            <ArrowLeft className="size-3.5" /> Volver a iniciar sesión
          </button>
        </>
      )}
    </AuthShell>
  );
}
