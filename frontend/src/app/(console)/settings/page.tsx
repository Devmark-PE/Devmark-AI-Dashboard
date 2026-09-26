"use client";

import { useState } from "react";

import { TwoFactorCard } from "@/components/TwoFactorCard";

import { Button, Card, CardHeader, ErrorState, Field, InlineError, Input, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { PlatformSettings } from "@/lib/types";

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) return setError("Las contraseñas nuevas no coinciden");
    setSaving(true);
    try {
      await api("/settings/password", { method: "POST", json: { current_password: current, new_password: next } });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 px-5 py-4">
      <Field label="Contraseña actual">{(id) => <Input id={id} type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nueva contraseña" hint="Mínimo 12 caracteres.">
          {(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={12} value={next} onChange={(e) => setNext(e.target.value)} />}
        </Field>
        <Field label="Repite la nueva contraseña">{(id) => <Input id={id} type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
      </div>
      <InlineError message={error} />
      {done && <p className="text-[13px] text-good-text">Contraseña actualizada. Se cerraron tus otras sesiones.</p>}
      <Button type="submit" variant="primary" loading={saving}>
        Cambiar contraseña
      </Button>
    </form>
  );
}

export default function SettingsPage() {
  const { me } = useAuth();
  const settings = useResource<PlatformSettings>("/settings");
  const [revoking, setRevoking] = useState(false);
  const s = settings.data;

  return (
    <div className="max-w-4xl space-y-5">
      <PageHeader title="Configuración" description="Tu cuenta de administrador y la configuración efectiva de la plataforma." />

      <Card>
        <CardHeader title="Cuenta" description={me?.user.email} />
        <PasswordForm />
      </Card>

      <TwoFactorCard />

      {settings.loading && !s ? (
        <LoadingState />
      ) : settings.error || !s ? (
        <Card>
          <ErrorState message={settings.error ?? "Sin datos"} onRetry={settings.reload} />
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader
              title="Sesiones activas"
              action={
                s.sessions.length > 1 && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={revoking}
                    onClick={async () => {
                      setRevoking(true);
                      try {
                        await api("/settings/sessions/revoke-others", { method: "POST" });
                        await settings.reload();
                      } finally {
                        setRevoking(false);
                      }
                    }}
                  >
                    Cerrar las demás
                  </Button>
                )
              }
            />
            <ul className="divide-y divide-line">
              {s.sessions.map((session) => (
                <li key={session.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate text-fg">{session.user_agent ?? "Navegador desconocido"}</p>
                    <p className="text-xs text-fg-3">
                      {session.ip ?? "IP desconocida"} · iniciada {formatDateTime(session.created_at)} · activa {relativeTime(session.last_seen_at)}
                    </p>
                  </div>
                  {session.current && <StatusBadge status="online" label="Esta sesión" />}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Plataforma" description="Se cambia en el .env del servidor y se aplica al reiniciar el servicio. Los secretos nunca se muestran." />
            <dl className="divide-y divide-line text-sm">
              {[
                ["URL pública", s.public_base_url, null],
                ["Modelo por defecto", s.default_model, "DEFAULT_MODEL"],
                ["Modelos permitidos", s.allowed_models.length ? s.allowed_models.join(", ") : "Todos los instalados", "ALLOWED_MODELS"],
                ["Peticiones simultáneas a Ollama", s.ollama_max_concurrency, "OLLAMA_MAX_CONCURRENCY"],
                ["Key heredada (.env)", s.legacy_api_key_enabled ? "Activa — desactívala cuando migres tus clientes" : "Desactivada", "LEGACY_API_KEY_ENABLED"],
                ["Guardar contenido de requests", s.log_request_content ? "Sí" : "No", "LOG_REQUEST_CONTENT"],
                ["Máx. mensajes / caracteres", `${s.max_messages} / ${s.max_input_chars.toLocaleString("es-PE")}`, "MAX_MESSAGES · MAX_INPUT_CHARS"],
                ["Duración de sesión", `${s.session_ttl_hours} h`, "SESSION_TTL_HOURS"],
                ["Zona horaria", s.dashboard_timezone, "DASHBOARD_TIMEZONE"],
              ].map(([label, value, env]) => (
                <div key={String(label)} className="grid gap-1 px-5 py-3 sm:grid-cols-[16rem_1fr]">
                  <dt className="text-fg-3">
                    {label}
                    {env && <span className="block font-mono text-[11px] text-fg-3/70">{env}</span>}
                  </dt>
                  <dd className="text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
