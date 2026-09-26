"use client";

import { ChevronDown, Download, FileText, Lightbulb, Library, Plus, Search, Star, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { DataTable, type Column } from "@/components/ui/DataTable";
import {
  Button,
  Card,
  CardHeader,
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
  Textarea,
  cx,
} from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBytes, formatDate, formatNumber } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import { downloadText, RAG_FORMATS, RAG_TEMPLATE, RAG_TIPS } from "@/lib/guides";
import type { Application, RagDocument, RagResult } from "@/lib/types";

const MAX_FILE_BYTES = 8 * 1024 * 1024;

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* Guía: cómo preparar documentos                                        */
/* ------------------------------------------------------------------ */

function RagGuide({ defaultOpen }: { defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
          <Lightbulb className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-fg">Cómo preparar tus documentos</span>
          <span className="block text-[13px] text-fg-3">Qué formato usar y cómo escribir para que la IA encuentre la respuesta correcta.</span>
        </span>
        <ChevronDown className={cx("size-4 text-fg-3 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="grid gap-6 border-t border-line px-5 py-5 lg:grid-cols-2">
          <div className="space-y-5">
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Formato recomendado</h3>
              <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                {RAG_FORMATS.map((f) => (
                  <li key={f.format} className="flex items-start gap-3 px-3 py-2.5">
                    <span className="flex w-14 shrink-0 gap-0.5 pt-0.5" aria-label={`${f.rating} de 3`}>
                      {[1, 2, 3].map((n) => (
                        <Star key={n} className={cx("size-3.5", n <= f.rating ? "fill-warning text-warning" : "text-line-strong")} aria-hidden />
                      ))}
                    </span>
                    <span className="min-w-0 text-[13px]">
                      <span className="font-medium text-fg">{f.format}</span> <span className="text-fg-3">— {f.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Cómo escribirlo</h3>
              <ol className="mt-2 space-y-2">
                {RAG_TIPS.map((t, i) => (
                  <li key={t.title} className="flex gap-2.5 text-[13px]">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-fg-2">{i + 1}</span>
                    <span>
                      <span className="font-medium text-fg">{t.title}.</span> <span className="text-fg-2">{t.text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <section className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-fg-3 uppercase">Plantilla (.md)</h3>
              <div className="flex gap-1">
                <CopyButton value={RAG_TEMPLATE} variant="ghost" className="!h-7" />
                <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={() => downloadText("plantilla-conocimiento.md", RAG_TEMPLATE)}>
                  Descargar
                </Button>
              </div>
            </div>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-line bg-bg-subtle p-3 font-mono text-[12px] leading-5 whitespace-pre-wrap text-fg-2">{RAG_TEMPLATE}</pre>
            <p className="mt-2 text-xs text-fg-3">
              Después de subir, usa <strong className="text-fg-2">Probar búsqueda</strong> con preguntas reales: si el fragmento correcto aparece primero, la IA responderá bien.
            </p>
          </section>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Añadir documento: texto pegado o archivo .txt/.md/.pdf               */
/* ------------------------------------------------------------------ */

function AddDocumentModal({ app, onClose, onSaved }: { app: Application; onClose: () => void; onSaved: () => void }) {
  const [mode, setMode] = useState<"text" | "file">("file");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!/\.(txt|md|markdown|pdf)$/i.test(f.name)) return setError("Formato no soportado. Usa .txt, .md o .pdf");
    if (f.size > MAX_FILE_BYTES) return setError("El archivo supera 8 MB");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload =
        mode === "text"
          ? { application_id: app.id, title, text }
          : { application_id: app.id, title, filename: file?.name, content_base64: file ? await readAsBase64(file) : "" };
      await api("/rag/documents", { method: "POST", json: payload });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Añadir documento a ${app.name}`}
      description="Se divide en fragmentos y se indexa para búsqueda en español. Solo lo usa esta aplicación."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="doc-form" loading={saving} disabled={mode === "file" ? !file : text.trim().length < 20}>
            Añadir e indexar
          </Button>
        </>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "file", label: "Archivo" },
            { value: "text", label: "Pegar texto" },
          ]}
        />
        {mode === "file" ? (
          <label
            className={cx(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors",
              file ? "border-accent/50 bg-accent-soft" : "border-line-strong bg-bg-subtle hover:border-accent/40",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <Upload className="size-5 text-fg-3" />
            {file ? (
              <span className="text-sm text-fg">
                {file.name} <span className="text-fg-3">· {formatBytes(file.size)}</span>
              </span>
            ) : (
              <span className="text-sm text-fg-2">
                Arrastra un archivo o <span className="text-accent-strong">elige uno</span>
                <span className="mt-1 block text-xs text-fg-3">.md (recomendado), .txt o .pdf · máx. 8 MB · PDF con texto (no escaneado)</span>
              </span>
            )}
            <input type="file" accept=".pdf,.txt,.md,.markdown" className="sr-only" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
          </label>
        ) : (
          <Field label="Contenido" hint="Preguntas frecuentes, políticas, precios, horarios… Separa los temas con líneas en blanco.">
            {(id) => <Textarea id={id} rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Horario de atención: lunes a viernes de 9:00 a 18:00.\n\nPrecios: la limpieza dental cuesta S/ 120."} />}
          </Field>
        )}
        <Field label="Título" hint="Aparece como fuente en las respuestas.">
          {(id) => <Input id={id} required minLength={2} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Preguntas frecuentes" />}
        </Field>
        <InlineError message={error} />
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ver fragmentos de un documento                                       */
/* ------------------------------------------------------------------ */

function DocumentModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, loading, error } = useResource<RagDocument>(`/rag/documents/${id}`);
  return (
    <Modal open onClose={onClose} size="lg" title={data?.title ?? "Documento"} description={data ? `${data.chunk_count} fragmentos · ${formatNumber(data.char_count)} caracteres` : undefined}>
      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message={error ?? "No encontrado"} />
      ) : (
        <ol className="scrollbar-thin max-h-[60vh] space-y-2 overflow-y-auto">
          {data.chunks?.map((chunk) => (
            <li key={chunk.ordinal} className="rounded-lg border border-line bg-bg-subtle p-3">
              <p className="mb-1 font-mono text-[11px] text-fg-3">#{chunk.ordinal + 1}</p>
              <p className="text-[13px] whitespace-pre-wrap text-fg-2">{chunk.content}</p>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Probar búsqueda                                                      */
/* ------------------------------------------------------------------ */

function highlight(text: string, terms: string[]) {
  // Resalta por raíz («ubicados» marca «Ubicación»), como el stemmer de la búsqueda.
  const stems = Array.from(new Set(terms.filter((t) => t.length >= 4).map((t) => t.slice(0, Math.max(4, t.length - 3)))));
  if (!stems.length) return text;
  const escaped = stems.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`((?<![\\p{L}\\p{N}])(?:${escaped.join("|")})[\\p{L}\\p{N}]*)`, "giu");
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i} className="rounded bg-accent-soft px-0.5 text-fg">{part}</mark> : part));
}

function SearchTester({ app }: { app: Application }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ terms: string[]; results: RagResult[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await api("/rag/search", { method: "POST", json: { application_id: app.id, query, top_k: app.rag_top_k } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error en la búsqueda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Probar búsqueda" description={`Qué fragmentos se darían al modelo como contexto (top ${app.rag_top_k}).`} />
      <div className="space-y-3 px-5 py-4">
        <form onSubmit={run} className="flex gap-2">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="¿Cuánto cuesta una limpieza?" aria-label="Pregunta de prueba" />
          <Button type="submit" variant="primary" loading={loading} icon={<Search className="size-4" />}>
            Buscar
          </Button>
        </form>
        <InlineError message={error} />
        {result &&
          (result.results.length ? (
            <ol className="space-y-2">
              {result.results.map((r, i) => (
                <li key={r.chunk_id} className="rounded-lg border border-line bg-bg-subtle p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                    <span className="font-medium text-fg">[{i + 1}] {r.title}</span>
                    <span>fragmento #{r.ordinal + 1}</span>
                    <Tag>relevancia {r.score.toFixed(3)}</Tag>
                  </div>
                  <p className="text-[13px] whitespace-pre-wrap text-fg-2">{highlight(r.content, result.terms)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-fg-3">Sin resultados: el modelo respondería sin contexto. Prueba con otras palabras o añade documentos.</p>
          ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */

export default function KnowledgePage() {
  const apps = useResource<Application[]>("/applications");
  const [appId, setAppId] = useState("");
  const app = apps.data?.find((a) => a.id === appId) ?? null;
  const docs = useResource<RagDocument[]>(appId ? `/rag/documents?application_id=${appId}` : null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<RagDocument | null>(null);
  const [busy, setBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  useEffect(() => {
    if (appId || !apps.data?.length) return;
    const fromQuery = new URLSearchParams(window.location.search).get("application");
    setAppId(apps.data.find((a) => a.id === fromQuery)?.id ?? apps.data[0].id);
  }, [apps.data, appId]);

  async function updateApp(patch: Partial<Pick<Application, "rag_enabled" | "rag_top_k">>) {
    if (!app) return;
    setSettingsError(null);
    try {
      await api(`/applications/${app.id}`, { method: "PATCH", json: patch });
      await apps.reload();
    } catch (err) {
      setSettingsError(err instanceof ApiError ? err.message : "No se pudo guardar");
    }
  }

  async function removeDocument() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/rag/documents/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      await Promise.all([docs.reload(), apps.reload()]);
    } finally {
      setBusy(false);
    }
  }

  const reloadAll = () => void Promise.all([docs.reload(), apps.reload()]);

  const columns: Column<RagDocument>[] = [
    {
      key: "title",
      header: "Documento",
      cell: (d) => (
        <div className="flex min-w-48 items-center gap-3">
          <FileText className="size-4 shrink-0 text-fg-3" />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{d.title}</p>
            {d.filename && <p className="truncate text-xs text-fg-3">{d.filename}</p>}
          </div>
        </div>
      ),
    },
    { key: "type", header: "Tipo", cell: (d) => <Tag>{d.source_type === "text" ? "texto" : d.source_type}</Tag> },
    { key: "chunks", header: "Fragmentos", align: "right", cell: (d) => formatNumber(d.chunk_count) },
    { key: "size", header: "Tamaño", align: "right", hideOnMobile: true, cell: (d) => formatBytes(d.size_bytes) },
    { key: "date", header: "Añadido", hideOnMobile: true, cell: (d) => <span className="whitespace-nowrap">{formatDate(d.created_at)}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Acciones</span>,
      align: "right",
      cell: (d) => (
        <Button
          size="sm"
          variant="ghost"
          icon={<Trash2 className="size-3.5" />}
          aria-label={`Eliminar ${d.title}`}
          onClick={(e) => {
            e.stopPropagation();
            setDeleting(d);
          }}
        />
      ),
    },
  ];

  if (apps.loading && !apps.data) return <LoadingState />;
  if (apps.error) return <ErrorState message={apps.error} onRetry={apps.reload} />;

  return (
    <>
      <PageHeader
        title="Conocimiento (RAG)"
        description="Documentos de cada aplicación. Cuando el RAG está activo, la IA responde con esta información y cita las fuentes."
        actions={
          app && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Añadir documento
            </Button>
          )
        }
      />

      {!apps.data?.length ? (
        <div className="space-y-4">
          <Card>
            <EmptyState
              icon={<Library className="size-5" />}
              title="Primero crea una aplicación"
              description="Los documentos pertenecen a una aplicación (por ejemplo, DentalSoft)."
              action={
                <Link href="/applications/">
                  <Button variant="primary">Ir a Aplicaciones</Button>
                </Link>
              }
            />
          </Card>
          <RagGuide defaultOpen />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={appId} onChange={(e) => setAppId(e.target.value)} className="w-auto min-w-56" aria-label="Aplicación">
              {apps.data.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>

          {app && (
            <Card>
              <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-fg">RAG en la API de {app.name}</h2>
                    <StatusBadge status={app.rag_enabled ? "online" : "disabled"} label={app.rag_enabled ? "Activo" : "Inactivo"} />
                  </div>
                  <p className="mt-1 text-[13px] text-fg-3">
                    {app.rag_enabled
                      ? "Las peticiones con keys de esta aplicación a /v1/chat/completions reciben automáticamente contexto de estos documentos."
                      : "La API responde sin documentos. Puedes probar el RAG igualmente en el Playground o forzarlo por petición con \"rag\": true."}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <label className="flex items-center gap-2 text-[13px] text-fg-2">
                    Fragmentos
                    <Select value={String(app.rag_top_k)} onChange={(e) => void updateApp({ rag_top_k: Number(e.target.value) })} className="w-16" aria-label="Fragmentos por pregunta">
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <Button variant={app.rag_enabled ? "secondary" : "primary"} onClick={() => void updateApp({ rag_enabled: !app.rag_enabled })} disabled={!app.rag_enabled && !app.document_count}>
                    {app.rag_enabled ? "Desactivar" : "Activar RAG"}
                  </Button>
                </div>
              </div>
              {settingsError && (
                <div className="px-5 pb-4">
                  <InlineError message={settingsError} />
                </div>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Documentos" description={app ? `${app.document_count} documento(s)` : undefined} />
            {docs.loading && !docs.data ? (
              <LoadingState rows={3} />
            ) : docs.error ? (
              <ErrorState message={docs.error} onRetry={docs.reload} />
            ) : (
              <DataTable
                columns={columns}
                rows={docs.data ?? []}
                rowKey={(d) => d.id}
                onRowClick={(d) => setViewing(d.id)}
                empty={
                  <EmptyState
                    icon={<FileText className="size-5" />}
                    title="Sin documentos"
                    description="Sube un PDF o pega texto: preguntas frecuentes, precios, horarios, políticas…"
                    action={
                      <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
                        Añadir documento
                      </Button>
                    }
                  />
                }
              />
            )}
          </Card>

          {app && !!app.document_count && <SearchTester app={app} />}

          <RagGuide key={app?.id} defaultOpen={!!app && !app.document_count} />

          <p className="text-xs text-fg-3">
            Búsqueda de texto completo en español dentro de la base de datos: no usa memoria del servidor. Encuentra por palabras (ignora acentos y
            reconoce variaciones como «ubicados»/«ubicación»).
          </p>
        </div>
      )}

      {adding && app && <AddDocumentModal app={app} onClose={() => setAdding(false)} onSaved={reloadAll} />}
      {viewing && <DocumentModal id={viewing} onClose={() => setViewing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          danger
          loading={busy}
          title="Eliminar documento"
          confirmLabel="Eliminar"
          onClose={() => setDeleting(null)}
          onConfirm={removeDocument}
          description={
            <>
              Se eliminará <strong className="text-fg">{deleting.title}</strong> y sus {deleting.chunk_count} fragmentos. La IA dejará de usarlo de inmediato.
            </>
          }
        />
      )}
    </>
  );
}
