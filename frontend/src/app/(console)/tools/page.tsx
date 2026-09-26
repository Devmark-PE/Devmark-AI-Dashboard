"use client";

import { Database, Globe, Pencil, Play, Plus, ShieldCheck, Trash2, Webhook, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
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
  Textarea,
  cx,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatMs } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application, Tool, ToolParamType, ToolParameter, ToolTestResult } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Plantillas                                                           */
/* ------------------------------------------------------------------ */

interface Draft {
  name: string;
  description: string;
  kind: "http" | "web";
  method: "GET" | "POST";
  url_template: string;
  body_template: string;
  headers: { name: string; value: string; saved: boolean; preview: string }[];
  parameters: ToolParameter[];
  response_path: string;
  max_chars: number;
  enabled: boolean;
  application_ids: string[];
}

const EMPTY: Draft = {
  name: "",
  description: "",
  kind: "http",
  method: "GET",
  url_template: "",
  body_template: "",
  headers: [],
  parameters: [],
  response_path: "",
  max_chars: 1500,
  enabled: true,
  application_ids: [],
};

const TEMPLATES: { id: string; label: string; hint: string; icon: typeof Database; draft: Partial<Draft> }[] = [
  {
    id: "supabase",
    label: "Tabla de Supabase",
    hint: "Leads, clientes, pedidos… vía la API REST de tu proyecto",
    icon: Database,
    draft: {
      name: "buscar_lead",
      description: "Busca leads de la empresa por nombre. Devuelve nombre, teléfono, ciudad, estado y fecha.",
      url_template: "https://TU-PROYECTO.supabase.co/rest/v1/leads?select=nombre,telefono,ciudad,estado,created_at&nombre=ilike.*{nombre}*&ciudad=eq.{ciudad}&order=created_at.desc&limit=5",
      headers: [{ name: "apikey", value: "", saved: false, preview: "" }],
      parameters: [
        { name: "nombre", type: "string", description: "Nombre o parte del nombre del lead", required: true },
        { name: "ciudad", type: "string", description: "Ciudad exacta (opcional)" },
      ],
    },
  },
  {
    id: "api",
    label: "API JSON",
    hint: "Cualquier API de tus sistemas (GET o POST)",
    icon: Webhook,
    draft: {
      name: "consultar_pedido",
      description: "Consulta el estado de un pedido por su número.",
      url_template: "https://api.tuempresa.com/pedidos/{numero}",
      parameters: [{ name: "numero", type: "string", description: "Número de pedido", required: true }],
    },
  },
  {
    id: "web",
    label: "Página web",
    hint: "Lee una página en el momento (promociones, horarios…)",
    icon: Globe,
    draft: {
      name: "leer_promociones",
      description: "Lee la página de promociones vigentes de la web de la empresa.",
      kind: "web",
      url_template: "https://www.tuempresa.com/promociones",
      max_chars: 2500,
    },
  },
];

function toDraft(tool: Tool): Draft {
  return {
    name: tool.name,
    description: tool.description,
    kind: tool.kind,
    method: tool.method,
    url_template: tool.url_template,
    body_template: tool.body_template ?? "",
    headers: tool.headers.map((h) => ({ name: h.name, value: "", saved: h.has_value, preview: h.preview })),
    parameters: tool.parameters.map((p) => ({ ...p })),
    response_path: tool.response_path ?? "",
    max_chars: tool.max_chars,
    enabled: tool.enabled,
    application_ids: tool.applications.map((a) => a.id),
  };
}

function host(url: string) {
  try {
    return new URL(url.replace(/\{[a-z0-9_]+\}/g, "x")).host;
  } catch {
    return url;
  }
}

function placeholders(text: string) {
  return Array.from(new Set(Array.from(text.matchAll(/\{([a-z][a-z0-9_]*)\}/g), (m) => m[1])));
}

/* ------------------------------------------------------------------ */
/* Editor                                                               */
/* ------------------------------------------------------------------ */

function ToolEditor({ tool, apps, onClose, onSaved }: { tool: Tool | null; apps: Application[]; onClose: () => void; onSaved: (t: Tool) => void }) {
  const [draft, setDraft] = useState<Draft>(tool ? toDraft(tool) : EMPTY);
  const [template, setTemplate] = useState<string | null>(tool ? "custom" : null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const used = placeholders(draft.url_template + " " + (draft.method === "POST" ? draft.body_template : ""));
  const declared = new Set(draft.parameters.map((p) => p.name));
  const undeclared = used.filter((n) => !declared.has(n));

  function setParam(i: number, patch: Partial<ToolParameter>) {
    set("parameters", draft.parameters.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function setHeader(i: number, patch: Partial<Draft["headers"][number]>) {
    set("headers", draft.headers.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...draft,
        body_template: draft.method === "POST" ? draft.body_template || null : null,
        response_path: draft.response_path || null,
        headers: draft.headers.filter((h) => h.name.trim()).map((h) => ({ name: h.name.trim(), value: h.value ? h.value : h.saved ? null : "" })),
        parameters: draft.parameters.map((p) => ({ ...p, enum: p.enum?.length ? p.enum : undefined })),
      };
      const saved = await api<Tool>(tool ? `/tools/${tool.id}` : "/tools", { method: tool ? "PUT" : "POST", json: payload });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!template) {
    return (
      <Modal open onClose={onClose} size="lg" title="Nueva herramienta" description="Elige un punto de partida. Podrás ajustar todo en el siguiente paso.">
        <div className="grid gap-3 sm:grid-cols-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setDraft({ ...EMPTY, ...t.draft, headers: t.draft.headers ?? [], parameters: t.draft.parameters ?? [] });
                setTemplate(t.id);
              }}
              className="rounded-xl border border-line bg-bg-subtle p-4 text-left transition-colors hover:border-accent/50 hover:bg-accent-soft"
            >
              <t.icon className="size-5 text-accent-strong" />
              <span className="mt-3 block text-sm font-semibold text-fg">{t.label}</span>
              <span className="mt-1 block text-xs text-fg-3">{t.hint}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setTemplate("custom")} className="mt-4 text-[13px] text-fg-2 underline-offset-4 hover:text-fg hover:underline">
          Empezar en blanco
        </button>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      dismissible={!saving}
      title={tool ? `Editar ${tool.name}` : "Nueva herramienta"}
      description="El modelo ve el nombre, la descripción y los parámetros. La URL y las cabeceras nunca salen del servidor."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="tool-form" loading={saving} disabled={undeclared.length > 0}>
            {tool ? "Guardar cambios" : "Crear herramienta"}
          </Button>
        </>
      }
    >
      <form id="tool-form" onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre (función)" hint="minúsculas y guion bajo: buscar_lead">
            {(id) => (
              <Input
                id={id}
                required
                pattern="[a-z][a-z0-9_]{1,47}"
                value={draft.name}
                onChange={(e) => set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                className="font-mono"
              />
            )}
          </Field>
          <Field label="Tipo">
            {() => (
              <Segmented
                value={draft.kind}
                onChange={(v) => setDraft((d) => ({ ...d, kind: v, method: v === "web" ? "GET" : d.method }))}
                options={[
                  { value: "http", label: "API (JSON)" },
                  { value: "web", label: "Página web" },
                ]}
              />
            )}
          </Field>
        </div>

        <Field label="Descripción para la IA" hint="Cuándo usarla y qué devuelve. Es lo que el modelo lee para decidir; sé concreto.">
          {(id) => <Textarea id={id} required minLength={10} rows={2} value={draft.description} onChange={(e) => set("description", e.target.value)} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
          <Field label="Método">
            {(id) => (
              <Select id={id} value={draft.method} disabled={draft.kind === "web"} onChange={(e) => set("method", e.target.value as Draft["method"])}>
                <option>GET</option>
                <option>POST</option>
              </Select>
            )}
          </Field>
          <Field label="URL" hint={<>Inserta parámetros con <code className="font-mono">{"{nombre}"}</code>. Si un parámetro opcional no llega, se quita su filtro de la URL.</>}>
            {(id) => (
              <Textarea id={id} required rows={2} value={draft.url_template} onChange={(e) => set("url_template", e.target.value)} className="font-mono text-[13px]" placeholder="https://api.tuempresa.com/pedidos/{numero}" />
            )}
          </Field>
        </div>

        {draft.method === "POST" && (
          <Field label="Cuerpo JSON (opcional)" hint={<>Valores sin comillas: <code className="font-mono">{'{"q": {texto}}'}</code>. Vacío = se envían los parámetros tal cual.</>}>
            {(id) => <Textarea id={id} rows={3} value={draft.body_template} onChange={(e) => set("body_template", e.target.value)} className="font-mono text-[13px]" />}
          </Field>
        )}

        {/* Parámetros */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-fg-2">Parámetros que rellena la IA</h3>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set("parameters", [...draft.parameters, { name: undeclared[0] ?? "", type: "string", description: "" }])} disabled={draft.parameters.length >= 8}>
              Añadir
            </Button>
          </div>
          {undeclared.length > 0 && (
            <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-fg">
              La URL usa {undeclared.map((n) => `{${n}}`).join(", ")} pero no está definido como parámetro.
            </p>
          )}
          {draft.parameters.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-3 py-3 text-xs text-fg-3">Sin parámetros: la herramienta siempre llama a la misma URL.</p>
          ) : (
            <div className="space-y-2">
              {draft.parameters.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-bg-subtle p-2.5 sm:grid-cols-[140px_110px_1fr_auto_auto] sm:items-center">
                  <Input aria-label="Nombre del parámetro" value={p.name} onChange={(e) => setParam(i, { name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} placeholder="nombre" className="font-mono" required />
                  <Select aria-label="Tipo" value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ToolParamType })}>
                    <option value="string">texto</option>
                    <option value="integer">entero</option>
                    <option value="number">número</option>
                    <option value="boolean">sí/no</option>
                  </Select>
                  <Input aria-label="Descripción" value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} placeholder="Qué valor debe poner la IA" className="col-span-2 sm:col-span-1" />
                  <label className="flex items-center gap-1.5 text-xs text-fg-2">
                    <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={!!p.required} onChange={(e) => setParam(i, { required: e.target.checked })} />
                    Obligatorio
                  </label>
                  <Button size="sm" variant="ghost" aria-label={`Quitar ${p.name}`} icon={<X className="size-3.5" />} onClick={() => set("parameters", draft.parameters.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Cabeceras */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-fg-2">Cabeceras (credenciales)</h3>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set("headers", [...draft.headers, { name: "", value: "", saved: false, preview: "" }])} disabled={draft.headers.length >= 10}>
              Añadir
            </Button>
          </div>
          {draft.headers.map((h, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[180px_1fr_auto]">
              <Input aria-label="Cabecera" value={h.name} onChange={(e) => setHeader(i, { name: e.target.value })} placeholder="Authorization" className="font-mono" />
              <Input
                aria-label={`Valor de ${h.name || "la cabecera"}`}
                type="password"
                autoComplete="off"
                value={h.value}
                onChange={(e) => setHeader(i, { value: e.target.value })}
                placeholder={h.saved ? `Guardado ${h.preview} · escribe para cambiarlo` : "Valor"}
                className="col-span-2 row-start-2 font-mono sm:col-span-1 sm:row-start-auto"
                required={!h.saved}
              />
              <Button size="sm" variant="ghost" aria-label={`Quitar ${h.name}`} icon={<X className="size-3.5" />} onClick={() => set("headers", draft.headers.filter((_, j) => j !== i))} className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto" />
            </div>
          ))}
          <p className="flex items-start gap-1.5 text-xs text-fg-3">
            <ShieldCheck className="mt-px size-3.5 shrink-0" /> Se guardan cifradas y nunca se vuelven a mostrar. Usa una key de solo lectura.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {draft.kind === "http" && (
            <Field label="Ruta del resultado (opcional)" hint="Para quedarte con una parte del JSON: data.items">
              {(id) => <Input id={id} value={draft.response_path} onChange={(e) => set("response_path", e.target.value)} className="font-mono" placeholder="data" />}
            </Field>
          )}
          <Field label="Máx. caracteres para la IA" hint="Resultados más cortos = respuestas más rápidas.">
            {(id) => <Input id={id} type="number" min={200} max={6000} step={100} value={draft.max_chars} onChange={(e) => set("max_chars", Number(e.target.value))} />}
          </Field>
        </div>

        <section className="space-y-2">
          <h3 className="text-[13px] font-medium text-fg-2">Aplicaciones que pueden usarla</h3>
          {apps.length === 0 ? (
            <p className="text-xs text-fg-3">
              Aún no hay aplicaciones. <Link href="/applications/" className="text-accent-strong">Crea una</Link>.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {apps.map((a) => (
                <Checkbox
                  key={a.id}
                  label={a.name}
                  description={a.status === "active" ? undefined : "Deshabilitada"}
                  checked={draft.application_ids.includes(a.id)}
                  onChange={(v) => set("application_ids", v ? [...draft.application_ids, a.id] : draft.application_ids.filter((x) => x !== a.id))}
                />
              ))}
            </div>
          )}
        </section>

        <Checkbox checked={draft.enabled} onChange={(v) => set("enabled", v)} label="Activa" description="Si la desactivas, ninguna aplicación la usa." />
        <InlineError message={error} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Probar                                                               */
/* ------------------------------------------------------------------ */

function TestModal({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const args = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
      setResult(await api<ToolTestResult>(`/tools/${tool.id}/test`, { method: "POST", json: { arguments: args } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo ejecutar");
    } finally {
      setRunning(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Probar ${tool.name}`}
      description="Ejecuta la herramienta directamente (sin la IA) para ver qué datos recibiría el modelo."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" type="submit" form="tool-test" loading={running} icon={<Play className="size-4" />}>
            Ejecutar
          </Button>
        </>
      }
    >
      <form id="tool-test" onSubmit={run} className="space-y-4">
        {tool.parameters.length === 0 ? (
          <p className="text-sm text-fg-2">Esta herramienta no tiene parámetros.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {tool.parameters.map((p) => (
              <Field key={p.name} label={`${p.name}${p.required ? " *" : ""}`} hint={p.description}>
                {(id) =>
                  p.type === "boolean" ? (
                    <Select id={id} value={values[p.name] ?? ""} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}>
                      <option value="">—</option>
                      <option value="true">sí</option>
                      <option value="false">no</option>
                    </Select>
                  ) : (
                    <Input id={id} required={p.required} type={p.type === "string" ? "text" : "number"} value={values[p.name] ?? ""} onChange={(e) => setValues({ ...values, [p.name]: e.target.value })} />
                  )
                }
              </Field>
            ))}
          </div>
        )}
        <InlineError message={error} />
        {result && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={result.ok ? "success" : "error"} label={result.ok ? "Correcto" : "Falló"} />
              {result.status_code && <Tag>HTTP {result.status_code}</Tag>}
              <Tag>{formatMs(result.ms)}</Tag>
              {result.url && <span className="truncate font-mono text-fg-3">{result.url}</span>}
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-bg-subtle p-3 font-mono text-[12px] leading-5 whitespace-pre-wrap break-words text-fg-2">{result.result}</pre>
            <p className="text-xs text-fg-3">Esto es exactamente lo que recibe la IA (recortado a {tool.max_chars} caracteres).</p>
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */

export default function ToolsPage() {
  const tools = useResource<Tool[]>("/tools");
  const apps = useResource<Application[]>("/applications");
  const [editing, setEditing] = useState<Tool | "new" | null>(null);
  const [testing, setTesting] = useState<Tool | null>(null);
  const [deleting, setDeleting] = useState<Tool | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/tools/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      tools.reload();
    } finally {
      setBusy(false);
    }
  }

  if (tools.loading && !tools.data) return <LoadingState />;
  if (tools.error) return <ErrorState message={tools.error} onRetry={tools.reload} />;

  return (
    <>
      <PageHeader
        title="Herramientas"
        description="Permite que la IA consulte datos reales de tus sistemas (Supabase, APIs, páginas web) mientras responde."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
            Nueva herramienta
          </Button>
        }
      />

      {!tools.data?.length ? (
        <Card>
          <EmptyState
            icon={<Wrench className="size-5" />}
            title="Aún no hay herramientas"
            description="Ejemplo: «buscar_lead» consulta tu tabla de leads en Supabase y la IA responde con el dato real."
            action={
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing("new")}>
                Crear la primera
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tools.data.map((t) => {
            const Icon = t.kind === "web" ? Globe : t.url_template.includes(".supabase.co/") ? Database : Webhook;
            return (
              <Card key={t.id} className="flex flex-col">
                <div className="flex items-start gap-3 px-5 pt-4">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-accent-strong">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-mono text-sm font-semibold text-fg">{t.name}</h2>
                      <StatusBadge status={t.enabled ? "active" : "disabled"} label={t.enabled ? "Activa" : "Inactiva"} />
                    </div>
                    <p className="mt-1 text-[13px] text-fg-2">{t.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 px-5 pt-3">
                  <Tag>
                    {t.kind === "web" ? "WEB" : t.method} · {host(t.url_template)}
                  </Tag>
                  {t.parameters.map((p) => (
                    <Tag key={p.name} className={cx(p.required && "border-accent/30 text-accent-strong")}>
                      {p.name}
                      {p.required ? "*" : ""}
                    </Tag>
                  ))}
                </div>
                <div className="mt-3 flex-1 px-5 text-xs text-fg-3">
                  {t.applications.length ? (
                    <>Aplicaciones: <span className="text-fg-2">{t.applications.map((a) => a.name).join(", ")}</span></>
                  ) : (
                    <span className="text-warning">Sin aplicaciones asignadas: nadie la usa todavía.</span>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-1 border-t border-line px-3 py-2">
                  <Button size="sm" variant="ghost" icon={<Play className="size-3.5" />} onClick={() => setTesting(t)}>
                    Probar
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(t)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(t)} className="ml-auto" aria-label={`Eliminar ${t.name}`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid gap-3 text-xs text-fg-3 md:grid-cols-3">
        <p>
          <strong className="text-fg-2">Cómo funciona.</strong> Con keys de una aplicación que tenga herramientas, la IA decide si necesita una, el servidor la ejecuta y la IA
          responde con el resultado. Pruébalo en el Playground con «Usar herramientas».
        </p>
        <p>
          <strong className="text-fg-2">Seguro por diseño.</strong> La IA solo rellena parámetros: no ve URLs ni credenciales, no escribe SQL y no puede llamar a
          direcciones internas del servidor.
        </p>
        <p>
          <strong className="text-fg-2">Consejo.</strong> El modelo actual es pequeño: funciona mejor con 2–3 herramientas por aplicación, con descripciones claras
          y resultados cortos.
        </p>
      </div>

      {editing && (
        <ToolEditor
          tool={editing === "new" ? null : editing}
          apps={apps.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => tools.reload()}
        />
      )}
      {testing && <TestModal tool={testing} onClose={() => setTesting(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          danger
          loading={busy}
          title="Eliminar herramienta"
          confirmLabel="Eliminar"
          onClose={() => setDeleting(null)}
          onConfirm={remove}
          description={
            <>
              Se eliminará <strong className="text-fg">{deleting.name}</strong> y sus credenciales. Las aplicaciones dejarán de usarla de inmediato.
            </>
          }
        />
      )}
    </>
  );
}
