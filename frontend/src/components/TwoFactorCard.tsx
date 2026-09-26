"use client";

import { Download, ShieldCheck, ShieldOff } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { Button, Card, CardHeader, CopyButton, Field, InlineError, Input, Modal, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/hooks";

const msg = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message : fallback);

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const text = `Devmark AI — códigos de recuperación (cada uno sirve una sola vez)\n\n${codes.join("\n")}\n`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "devmark-ai-codigos-recuperacion.txt" });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-2">Guárdalos en un lugar seguro (gestor de contraseñas). Te permiten entrar si pierdes el teléfono. Cada uno sirve <b className="text-fg">una sola vez</b> y no se volverán a mostrar.</p>
      <ol className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-bg-subtle p-4 font-mono text-sm text-fg">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <CopyButton value={codes.join("\n")} label="Copiar" />
        <Button size="sm" icon={<Download className="size-3.5" />} onClick={download}>
          Descargar .txt
        </Button>
        <Button size="sm" variant="primary" className="ml-auto" onClick={onDone}>
          Ya los guardé
        </Button>
      </div>
    </div>
  );
}

function EnableModal({ onClose, onEnabled }: { onClose: () => void; onEnabled: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ secret: string; otpauth_uri: string }>("/auth/2fa/setup", { method: "POST" })
      .then(async (s) => {
        setSetup(s);
        setQr(await QRCode.toDataURL(s.otpauth_uri, { width: 220, margin: 1, color: { dark: "#0b0b0c", light: "#ffffff" } }));
      })
      .catch((err) => setError(msg(err, "No se pudo iniciar la configuración")));
  }, []);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ recovery_codes: string[] }>("/auth/2fa/enable", { method: "POST", json: { code } });
      setCodes(r.recovery_codes);
      onEnabled();
    } catch (err) {
      setError(msg(err, "Código incorrecto"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={codes ? () => undefined : onClose} dismissible={!codes} size="lg" title={codes ? "Guarda tus códigos de recuperación" : "Activar verificación en dos pasos"}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form onSubmit={confirm} className="space-y-5">
          <ol className="space-y-4 text-sm text-fg-2">
            <li>
              <b className="text-fg">1.</b> Instala una app de autenticación: Google Authenticator, Microsoft Authenticator, Authy o 1Password.
            </li>
            <li>
              <b className="text-fg">2.</b> Escanea este código QR con la app:
              <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <div className="grid size-[180px] shrink-0 place-items-center rounded-xl bg-white p-2">{qr ? <img src={qr} alt="Código QR para la app de autenticación" width={164} height={164} /> : <span className="text-xs text-black/50">Generando…</span>}</div>
                {setup && (
                  <div className="min-w-0 text-xs text-fg-3">
                    ¿No puedes escanear? Escribe esta clave en la app:
                    <code className="mt-1.5 block rounded-lg border border-line bg-bg-subtle p-2 font-mono text-[13px] break-all text-fg select-all">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                    <CopyButton value={setup.secret} variant="ghost" className="mt-1" label="Copiar clave" />
                  </div>
                )}
              </div>
            </li>
            <li>
              <b className="text-fg">3.</b> Escribe el código de 6 dígitos que muestra la app:
            </li>
          </ol>
          <Input
            aria-label="Código de 6 dígitos"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
            placeholder="000000"
            className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
          />
          <InlineError message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={code.length !== 6 || !setup}>
              Activar
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function ConfirmIdentityModal({ mode, onClose, onDone }: { mode: "disable" | "regenerate"; onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const second = /^\d{6}$/.test(code) ? { code } : { recovery_code: code };
    try {
      if (mode === "disable") {
        await api("/auth/2fa/disable", { method: "POST", json: { password, ...second } });
        onDone();
        onClose();
      } else {
        const r = await api<{ recovery_codes: string[] }>("/auth/2fa/recovery-codes", { method: "POST", json: { password, ...second } });
        setCodes(r.recovery_codes);
        onDone();
      }
    } catch (err) {
      setError(msg(err, "No se pudo completar"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} dismissible={!codes} title={codes ? "Nuevos códigos de recuperación" : mode === "disable" ? "Desactivar verificación en dos pasos" : "Generar nuevos códigos de recuperación"}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={onClose} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-fg-2">{mode === "disable" ? "Tu cuenta quedará protegida solo con la contraseña." : "Los códigos anteriores dejarán de funcionar."} Confirma tu identidad:</p>
          <Field label="Contraseña">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
          <Field label="Código de la app o de recuperación">{(id) => <Input id={id} required value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="000000 o abcde-12345" className="font-mono" autoComplete="one-time-code" />}</Field>
          <InlineError message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant={mode === "disable" ? "danger" : "primary"} loading={busy}>
              {mode === "disable" ? "Desactivar" : "Generar códigos"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function TwoFactorCard() {
  const { refresh } = useAuth();
  const status = useResource<{ enabled: boolean; recovery_codes_remaining: number }>("/auth/2fa");
  const [modal, setModal] = useState<"enable" | "disable" | "regenerate" | null>(null);
  const enabled = status.data?.enabled;
  const remaining = status.data?.recovery_codes_remaining ?? 0;
  const reload = () => void Promise.all([status.reload(), refresh()]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Verificación en dos pasos (2FA)
            {status.data && <StatusBadge status={enabled ? "online" : "disabled"} label={enabled ? "Activa" : "Inactiva"} />}
          </span>
        }
        description="Además de la contraseña, se pide un código de tu teléfono al iniciar sesión."
      />
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3 text-sm text-fg-2">
          {enabled ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-good-text" /> : <ShieldOff className="mt-0.5 size-5 shrink-0 text-fg-3" />}
          <p>
            {enabled ? (
              <>
                Tu cuenta está protegida. Te quedan <b className={remaining <= 3 ? "text-warning" : "text-fg"}>{remaining}</b> códigos de recuperación.
              </>
            ) : (
              "Recomendado: si alguien obtiene tu contraseña, no podrá entrar sin tu teléfono."
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {enabled ? (
            <>
              <Button size="sm" onClick={() => setModal("regenerate")}>
                Nuevos códigos
              </Button>
              <Button size="sm" variant="danger" onClick={() => setModal("disable")}>
                Desactivar
              </Button>
            </>
          ) : (
            <Button variant="primary" icon={<ShieldCheck className="size-4" />} onClick={() => setModal("enable")} disabled={!status.data}>
              Activar 2FA
            </Button>
          )}
        </div>
      </div>
      {modal === "enable" && <EnableModal onClose={() => setModal(null)} onEnabled={reload} />}
      {(modal === "disable" || modal === "regenerate") && <ConfirmIdentityModal mode={modal} onClose={() => setModal(null)} onDone={reload} />}
    </Card>
  );
}
