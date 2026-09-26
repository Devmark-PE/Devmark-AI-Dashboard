"use client";

import { AlertTriangle, KeyRound, MoreHorizontal, Plus, RefreshCw, RotateCcw, ShieldOff, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Segmented,
  Select,
  StatusBadge,
  Tag,
  cx,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { ApiKey, ApiKeyCreated, Application, Permission } from "@/lib/types";

type Filter = "all" | "active" | "revoked" | "expired";

const PERMISSION_INFO: Record<Permission, { label: string; description: string }> = {
  chat: { label: "Chat completions", description: "POST /v1/chat/completions" },
  models: { label: "Listar modelos", description: "GET /v1/models" },
};

/* ------------------------------------------------------------------ */
/* Pantalla "cópiala ahora": la key completa solo existe aquí          */
/* ------------------------------------------------------------------ */

function KeyReveal({ open, apiKey, onClose, title = "Guarda tu API key", note }: { open: boolean; apiKey: ApiKeyCreated; onClose: () => void; title?: string; note?: React.ReactNode }) {
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={false}
      title={title}
      description="Esta es la única vez que verás la key completa. Si la pierdes, podrás regenerarla."
      footer={
        <Button variant="primary" onClick={onClose} disabled={!acknowledged}>
          Listo
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-accent/30 bg-accent-soft p-4">
          <p className="mb-2 text-xs font-medium text-fg-2">
            {apiKey.name} · {apiKey.application_name}
          </p>
          <code className="block font-mono text-[13px] break-all text-fg select-all">{apiKey.key}</code>
          <div className="mt-3 flex justify-end">
            <CopyButton value={apiKey.key} label="Copiar key" variant="primary" />
          </div>
        </div>
        {note}
        <div className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/10 p-3 text-[13px] text-fg-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            Guárdala en el gestor de secretos o en el <code className="font-mono text-fg">.env</code> de tu aplicación. Nunca la publiques en el frontend ni en un repositorio.
          </p>
        </div>
        <Checkbox checked={acknowledged} onChange={setAcknowledged} label="Ya copié y guardé la key en un lugar seguro" />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Regenerar: emite una key nueva y retira la anterior con gracia      */
/* ------------------------------------------------------------------ */

const GRACE_OPTIONS = [
  { value: "0", label: "Ninguno" },
  { value: "24", label: "24 horas" },
  { value: "168", label: "7 días" },
] as const;

function RegenerateModal({ apiKey, onClose, onDone }: { apiKey: ApiKey; onClose: () => void; onDone: () => void }) {
  const [grace, setGrace] = useState<"0" | "24" | "168">(apiKey.effective_status === "active" ? "24" : "0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      setCreated(await api<ApiKeyCreated>(`/api-keys/${apiKey.id}/regenerate`, { method: "POST", json: { grace_hours: Number(grace) } }));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo regenerar la key");
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    const label = GRACE_OPTIONS.find((o) => o.value === grace)?.label;
    return (
      <KeyReveal
        open
        apiKey={created}
        onClose={onClose}
        title="Nueva key generada"
        note={
          <p className="text-[13px] text-fg-2">
            {apiKey.effective_status !== "active" || grace === "0"
              ? "La key anterior ya no funciona."
              : `La key anterior (${apiKey.prefix}…) seguirá funcionando ${label}. Actualiza tu aplicación antes de que expire.`}
          </p>
        }
      />
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Regenerar «${apiKey.name}»`}
      description="Por seguridad no se guarda la key completa, así que no se puede volver a mostrar. Se creará una key nueva con la misma aplicación, permisos y límites."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} loading={saving} icon={<RefreshCw className="size-4" />}>
            Regenerar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {apiKey.effective_status === "active" ? (
          <>
            <p className="text-[13px] font-medium text-fg-2">La key actual seguirá funcionando durante</p>
            <Segmented value={grace} onChange={setGrace} options={GRACE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} />
            <p className="text-xs text-fg-3">
              {grace === "0" ? "Se revocará al instante: tu aplicación fallará hasta que pongas la key nueva." : "Tiempo para reemplazarla en tu aplicación sin cortes. Luego expira sola."}
            </p>
          </>
        ) : (
          <p className="text-[13px] text-fg-2">La key actual está {apiKey.effective_status === "revoked" ? "revocada" : "expirada"} y seguirá sin funcionar.</p>
        )}
        <InlineError message={error} />
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Crear key: formulario → pantalla de "cópiala ahora" (una sola vez)   */
/* ------------------------------------------------------------------ */

function CreateKeyModal({ open, onClose, applications, onCreated }: { open: boolean; onClose: () => void; applications: Application[]; onCreated: () => void }) {
  const activeApps = applications.filter((a) => a.status === "active");
  const [name, setName] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [permissions, setPermissions] = useState<Permission[]>(["chat", "models"]);
  const [expires, setExpires] = useState("");
  const [rateLimit, setRateLimit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<ApiKeyCreated | null>(null);

  function reset() {
    setName("");
    setApplicationId("");
    setEnvironment("live");
    setPermissions(["chat", "models"]);
    setExpires("");
    setRateLimit("");
    setError(null);
    setCreated(null);
  }

  function close() {
    // La key completa desaparece de la memoria al cerrar: no se puede volver a ver.
    reset();
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const result = await api<ApiKeyCreated>("/api-keys", {
        method: "POST",
        json: {
          name,
          application_id: applicationId || activeApps[0]?.id,
          environment,
          permissions,
          expires_at: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
          rate_limit_rpm: rateLimit ? Number(rateLimit) : null,
        },
      });
      setCreated(result);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la key");
    } finally {
      setSaving(false);
    }
  }

  if (created) return <KeyReveal open={open} apiKey={created} onClose={close} />;

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nueva API key"
      description="La key se asocia a una aplicación y hereda su estado."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="create-key" loading={saving} disabled={!activeApps.length || !permissions.length}>
            Crear key
          </Button>
        </>
      }
    >
      {!activeApps.length ? (
        <EmptyState
          title="Primero crea una aplicación"
          description="Cada API key pertenece a una aplicación (por ejemplo, DentalSoft o Devmark Web)."
          action={
            <Link href="/applications/">
              <Button variant="primary" icon={<Plus className="size-4" />}>
                Crear aplicación
              </Button>
            </Link>
          }
        />
      ) : (
        <form id="create-key" onSubmit={submit} className="space-y-4">
          <Field label="Nombre" hint="Para reconocerla, p. ej. «Producción» o «Servidor web».">
            {(id) => <Input id={id} required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aplicación">
              {(id) => (
                <Select id={id} value={applicationId || activeApps[0]?.id} onChange={(e) => setApplicationId(e.target.value)}>
                  {activeApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <div className="space-y-1.5">
              <p className="text-[13px] font-medium text-fg-2">Entorno</p>
              <Segmented
                value={environment}
                onChange={setEnvironment}
                options={[
                  { value: "live", label: "Live" },
                  { value: "test", label: "Test" },
                ]}
              />
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-fg-2">Permisos</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(PERMISSION_INFO) as Permission[]).map((perm) => (
                <Checkbox
                  key={perm}
                  checked={permissions.includes(perm)}
                  onChange={(checked) => setPermissions((prev) => (checked ? [...prev, perm] : prev.filter((p) => p !== perm)))}
                  label={PERMISSION_INFO[perm].label}
                  description={PERMISSION_INFO[perm].description}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expira (opcional)" hint="Vacío = no expira.">
              {(id) => <Input id={id} type="date" min={new Date().toISOString().slice(0, 10)} value={expires} onChange={(e) => setExpires(e.target.value)} />}
            </Field>
            <Field label="Límite por minuto (opcional)" hint="Vacío = sin límite propio.">
              {(id) => <Input id={id} type="number" min={1} max={100000} value={rateLimit} onChange={(e) => setRateLimit(e.target.value)} placeholder="p. ej. 30" />}
            </Field>
          </div>
          <InlineError message={error} />
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Acciones por key                                                     */
/* ------------------------------------------------------------------ */

type Action = { type: "revoke" | "reactivate" | "delete" | "regenerate"; key: ApiKey } | null;

const MENU_WIDTH = 184;

function KeyActions({ apiKey, onAction }: { apiKey: ApiKey; onAction: (a: Action) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // El menú se dibuja en <body> con posición fija: así no lo recorta el contenedor con scroll de la tabla.
  // Se recoloca si la página o la tabla se desplazan, y se cierra si el botón sale de la pantalla.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        setOpen(false);
        return;
      }
      const menuHeight = menuRef.current?.offsetHeight ?? 132;
      const up = rect.bottom + menuHeight + 8 > window.innerHeight && rect.top > menuHeight + 8;
      setPos({
        top: up ? rect.top - menuHeight - 4 : rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
        up,
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !buttonRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (a: Action) => {
    setOpen(false);
    onAction(a);
  };

  return (
    <div className="inline-block text-left" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-surface-3 hover:text-fg"
        aria-label={`Acciones para ${apiKey.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: MENU_WIDTH, visibility: pos ? "visible" : "hidden" }}
            className="animate-in z-50 rounded-xl border border-line-strong bg-surface-2 p-1 shadow-2xl shadow-black/40"
          >
            <MenuItem icon={<RefreshCw className="size-4" />} label="Regenerar key" onClick={() => choose({ type: "regenerate", key: apiKey })} />
            {apiKey.status === "active" ? (
              <MenuItem icon={<ShieldOff className="size-4" />} label="Revocar" onClick={() => choose({ type: "revoke", key: apiKey })} />
            ) : (
              apiKey.effective_status !== "expired" && <MenuItem icon={<RotateCcw className="size-4" />} label="Reactivar" onClick={() => choose({ type: "reactivate", key: apiKey })} />
            )}
            <div className="my-1 h-px bg-line" />
            <MenuItem danger icon={<Trash2 className="size-4" />} label="Eliminar" onClick={() => choose({ type: "delete", key: apiKey })} />
          </div>,
          document.body,
        )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cx("flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] hover:bg-surface-3", danger ? "text-critical-text" : "text-fg")}>
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */

export default function ApiKeysPage() {
  const keys = useResource<ApiKey[]>("/api-keys");
  const apps = useResource<Application[]>("/applications");
  const [filter, setFilter] = useState<Filter>("all");
  const [appFilter, setAppFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Filtro inicial desde "Ver keys" en Aplicaciones (?application=<id>).
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("application");
    if (fromQuery) setAppFilter(fromQuery);
  }, []);

  const rows = useMemo(
    () => (keys.data ?? []).filter((k) => (filter === "all" || k.effective_status === filter) && (!appFilter || k.application_id === appFilter)),
    [keys.data, filter, appFilter],
  );
  const counts = useMemo(() => {
    const c = { all: 0, active: 0, revoked: 0, expired: 0 };
    for (const k of keys.data ?? []) {
      c.all += 1;
      c[k.effective_status] += 1;
    }
    return c;
  }, [keys.data]);

  async function runAction() {
    if (!action) return;
    setBusy(true);
    setActionError(null);
    try {
      if (action.type === "delete") await api(`/api-keys/${action.key.id}`, { method: "DELETE" });
      else await api(`/api-keys/${action.key.id}/${action.type}`, { method: "POST" });
      setAction(null);
      await keys.reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<ApiKey>[] = [
    {
      key: "name",
      header: "Nombre",
      cell: (k) => (
        <div className="min-w-44">
          <p className="font-medium text-fg">{k.name}</p>
          <p className="text-xs text-fg-3">{k.application_name}</p>
        </div>
      ),
    },
    {
      key: "key",
      header: "Key",
      cell: (k) => (
        <div className="flex items-center gap-2">
          <code className="font-mono text-[13px] whitespace-nowrap text-fg-2">{k.masked_key}</code>
          {k.environment === "test" && <Tag>test</Tag>}
        </div>
      ),
    },
    { key: "status", header: "Estado", cell: (k) => <StatusBadge status={k.effective_status} /> },
    {
      key: "permissions",
      header: "Permisos",
      hideOnMobile: true,
      cell: (k) => (
        <div className="flex gap-1">
          {k.permissions.map((p) => (
            <Tag key={p}>{p}</Tag>
          ))}
        </div>
      ),
    },
    {
      key: "last_used",
      header: "Último uso",
      cell: (k) => (
        <span title={formatDateTime(k.last_used_at)} className={cx("whitespace-nowrap", k.last_used_at ? "text-fg-2" : "text-fg-3")}>
          {relativeTime(k.last_used_at)}
        </span>
      ),
    },
    {
      key: "created",
      header: "Creada",
      hideOnMobile: true,
      cell: (k) => (
        <span title={formatDateTime(k.created_at)} className="whitespace-nowrap">
          {formatDate(k.created_at)}
          {k.expires_at && <span className="block text-xs text-fg-3">Expira {formatDate(k.expires_at)}</span>}
        </span>
      ),
    },
    { key: "actions", header: <span className="sr-only">Acciones</span>, align: "right", cell: (k) => <KeyActions apiKey={k} onAction={setAction} /> },
  ];

  const confirmCopy = action && action.type !== "regenerate" && {
    revoke: {
      title: "Revocar API key",
      confirm: "Revocar",
      danger: true,
      body: (
        <>
          <strong className="text-fg">{action.key.name}</strong> dejará de funcionar de inmediato. Las peticiones con esta key recibirán <code className="font-mono">401</code>. Podrás reactivarla después.
        </>
      ),
    },
    reactivate: {
      title: "Reactivar API key",
      confirm: "Reactivar",
      danger: false,
      body: (
        <>
          <strong className="text-fg">{action.key.name}</strong> volverá a aceptar peticiones.
        </>
      ),
    },
    delete: {
      title: "Eliminar API key",
      confirm: "Eliminar",
      danger: true,
      body: (
        <>
          Se eliminará <strong className="text-fg">{action.key.name}</strong> de forma permanente. Los logs históricos se conservan con su prefijo. Esta acción no se puede deshacer.
        </>
      ),
    },
  }[action.type];

  return (
    <>
      <PageHeader
        title="API Keys"
        description="Credenciales de acceso a la API pública. Solo se guarda su hash: la key completa se muestra una única vez al crearla."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            Nueva API key
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `Todas ${counts.all}` },
            { value: "active", label: `Activas ${counts.active}` },
            { value: "revoked", label: `Revocadas ${counts.revoked}` },
            { value: "expired", label: `Expiradas ${counts.expired}` },
          ]}
        />
        <Select value={appFilter} onChange={(e) => setAppFilter(e.target.value)} className="w-auto min-w-48" aria-label="Filtrar por aplicación">
          <option value="">Todas las aplicaciones</option>
          {(apps.data ?? []).map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {keys.loading && !keys.data ? (
          <LoadingState rows={4} />
        ) : keys.error ? (
          <ErrorState message={keys.error} onRetry={keys.reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(k) => k.id}
            empty={
              <EmptyState
                icon={<KeyRound className="size-5" />}
                title={keys.data?.length ? "Ninguna key coincide con el filtro" : "Aún no hay API keys"}
                description={keys.data?.length ? "Prueba con otro estado o aplicación." : "Crea la primera key para que una aplicación consuma tu API."}
                action={
                  !keys.data?.length && (
                    <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
                      Nueva API key
                    </Button>
                  )
                }
              />
            }
          />
        )}
      </Card>

      <CreateKeyModal open={creating} onClose={() => setCreating(false)} applications={apps.data ?? []} onCreated={() => void keys.reload()} />

      {action?.type === "regenerate" && <RegenerateModal apiKey={action.key} onClose={() => setAction(null)} onDone={() => void keys.reload()} />}

      {action && confirmCopy && (
        <ConfirmDialog
          open
          onClose={() => {
            setAction(null);
            setActionError(null);
          }}
          onConfirm={runAction}
          loading={busy}
          title={confirmCopy.title}
          confirmLabel={confirmCopy.confirm}
          danger={confirmCopy.danger}
          description={
            <div className="space-y-3">
              <p>{confirmCopy.body}</p>
              <InlineError message={actionError} />
            </div>
          }
        />
      )}
    </>
  );
}
