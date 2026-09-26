"use client";

import { AppWindow, Pencil, Plus, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, InlineError, Input, LoadingState, Modal, PageHeader, StatusBadge, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { compactNumber, formatDate, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application } from "@/lib/types";

function ApplicationForm({ initial, onClose, onSaved }: { initial: Application | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [rateLimit, setRateLimit] = useState(initial?.rate_limit_rpm?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { name, description, rate_limit_rpm: rateLimit ? Number(rateLimit) : null };
      if (initial) await api(`/applications/${initial.id}`, { method: "PATCH", json: payload });
      else await api("/applications", { method: "POST", json: { ...payload, slug: slug || null } });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "Editar aplicación" : "Nueva aplicación"}
      description="Las aplicaciones agrupan API keys y permiten ver el uso por cliente."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="app-form" loading={saving}>
            {initial ? "Guardar" : "Crear aplicación"}
          </Button>
        </>
      }
    >
      <form id="app-form" onSubmit={submit} className="space-y-4">
        <Field label="Nombre">{(id) => <Input id={id} required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="DentalSoft" autoFocus />}</Field>
        {!initial && (
          <Field label="Slug (opcional)" hint="Identificador único. Si lo dejas vacío se genera a partir del nombre.">
            {(id) => <Input id={id} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="dentalsoft" className="font-mono" />}
          </Field>
        )}
        <Field label="Descripción">{(id) => <Textarea id={id} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="SaaS para clínicas dentales" />}</Field>
        <Field label="Límite por minuto (opcional)" hint="Aplica a todas las keys de la aplicación en conjunto. Vacío = sin límite.">
          {(id) => <Input id={id} type="number" min={1} max={100000} value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} />}
        </Field>
        <InlineError message={error} />
      </form>
    </Modal>
  );
}

export default function ApplicationsPage() {
  const apps = useResource<Application[]>("/applications");
  const [editing, setEditing] = useState<Application | null | "new">(null);
  const [confirm, setConfirm] = useState<{ type: "toggle" | "delete"; app: Application } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      if (confirm.type === "delete") await api(`/applications/${confirm.app.id}`, { method: "DELETE" });
      else await api(`/applications/${confirm.app.id}`, { method: "PATCH", json: { status: confirm.app.status === "active" ? "disabled" : "active" } });
      setConfirm(null);
      await apps.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Aplicaciones"
        description="Los clientes que consumen tu API. Cada aplicación tiene sus propias keys, uso y logs."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Nueva aplicación
          </Button>
        }
      />

      {apps.loading && !apps.data ? (
        <Card>
          <LoadingState rows={3} />
        </Card>
      ) : apps.error ? (
        <Card>
          <ErrorState message={apps.error} onRetry={apps.reload} />
        </Card>
      ) : !apps.data?.length ? (
        <Card>
          <EmptyState
            icon={<AppWindow className="size-5" />}
            title="Aún no hay aplicaciones"
            description="Registra Devmark Web, DentalSoft, BreezyLingo… y luego crea sus API keys."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
                Nueva aplicación
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.data.map((app) => (
            <Card key={app.id} className="flex flex-col p-5 transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 text-sm font-semibold text-fg">{app.name.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-fg">{app.name}</h3>
                    <p className="truncate font-mono text-xs text-fg-3">{app.slug}</p>
                  </div>
                </div>
                <StatusBadge status={app.status} />
              </div>
              <p className="mt-3 line-clamp-2 min-h-10 text-[13px] text-fg-2">{app.description || <span className="text-fg-3">Sin descripción</span>}</p>
              <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-xs">
                <div>
                  <dt className="text-fg-3">Keys activas</dt>
                  <dd className="tabular mt-0.5 text-sm font-medium text-fg">
                    {app.active_key_count}
                    <span className="text-fg-3">/{app.key_count}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-fg-3">Requests 30 d</dt>
                  <dd className="tabular mt-0.5 text-sm font-medium text-fg">{compactNumber(app.requests_30d)}</dd>
                </div>
                <div>
                  <dt className="text-fg-3">Último uso</dt>
                  <dd className="mt-0.5 text-sm font-medium text-fg">{relativeTime(app.last_used_at)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
                <Link href={`/api-keys/?application=${app.id}`} className="mr-auto text-[13px] font-medium text-accent-strong hover:underline">
                  Ver keys →
                </Link>
                <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(app)} aria-label={`Editar ${app.name}`} />
                <Button size="sm" variant="ghost" icon={<Power className="size-3.5" />} onClick={() => setConfirm({ type: "toggle", app })} aria-label={app.status === "active" ? `Deshabilitar ${app.name}` : `Habilitar ${app.name}`} />
                <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm({ type: "delete", app })} aria-label={`Eliminar ${app.name}`} />
              </div>
              <p className="mt-2 text-[11px] text-fg-3">Creada {formatDate(app.created_at)}</p>
            </Card>
          ))}
        </div>
      )}

      {editing && <ApplicationForm initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => void apps.reload()} />}

      {confirm && (
        <ConfirmDialog
          open
          onClose={() => {
            setConfirm(null);
            setError(null);
          }}
          onConfirm={runConfirm}
          loading={busy}
          danger={confirm.type === "delete" || confirm.app.status === "active"}
          title={confirm.type === "delete" ? "Eliminar aplicación" : confirm.app.status === "active" ? "Deshabilitar aplicación" : "Habilitar aplicación"}
          confirmLabel={confirm.type === "delete" ? "Eliminar" : confirm.app.status === "active" ? "Deshabilitar" : "Habilitar"}
          description={
            <div className="space-y-3">
              <p>
                {confirm.type === "delete"
                  ? "Solo se puede eliminar una aplicación sin API keys. Los logs históricos se conservan."
                  : confirm.app.status === "active"
                    ? `Todas las keys de ${confirm.app.name} dejarán de funcionar (403) hasta que la vuelvas a habilitar.`
                    : `Las keys activas de ${confirm.app.name} volverán a funcionar.`}
              </p>
              <InlineError message={error} />
            </div>
          }
        />
      )}
    </>
  );
}
