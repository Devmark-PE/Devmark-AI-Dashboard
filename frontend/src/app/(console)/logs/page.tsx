"use client";

import { ChevronLeft, ChevronRight, ScrollText, X } from "lucide-react";
import { useState } from "react";

import { requestColumns } from "@/components/RequestColumns";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button, Card, EmptyState, ErrorState, Input, LoadingState, Modal, PageHeader, Select, StatusBadge } from "@/components/ui";
import { formatDateTime, formatMs, formatNumber } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application, RequestLog } from "@/lib/types";

const PAGE = 50;

const columns: Column<RequestLog>[] = [
  {
    key: "time",
    header: "Fecha",
    cell: (r) => <span className="tabular whitespace-nowrap text-fg-2">{new Date(r.created_at).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>,
  },
  ...requestColumns.slice(1),
];

function Detail({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, loading, error } = useResource<RequestLog>(`/logs/${id}`);
  const rows: [string, React.ReactNode][] = data
    ? [
        ["Fecha", formatDateTime(data.created_at)],
        ["Aplicación", data.application_name ?? "—"],
        ["API key", data.api_key_name ? `${data.api_key_name} (${data.key_prefix}…)` : data.key_prefix === "legacy" ? "Key heredada (.env)" : (data.key_prefix ?? "—")],
        ["Endpoint", <code key="e" className="font-mono">{`${data.method} ${data.endpoint}`}</code>],
        ["Modelo", data.model ?? "—"],
        ["Tokens", `${formatNumber(data.prompt_tokens)} entrada · ${formatNumber(data.completion_tokens)} salida · ${formatNumber(data.total_tokens)} total`],
        ["Tiempo", formatMs(data.processing_ms)],
        ["Estado", <StatusBadge key="s" status={data.status} label={String(data.status_code)} />],
        ["IP cliente", data.client_ip ?? "—"],
      ]
    : [];
  return (
    <Modal open onClose={onClose} size="lg" title={`Request #${id}`}>
      {loading ? (
        <LoadingState />
      ) : error || !data ? (
        <ErrorState message={error ?? "No encontrado"} />
      ) : (
        <div className="space-y-4">
          <dl className="divide-y divide-line rounded-xl border border-line text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-2.5">
                <dt className="text-fg-3">{label}</dt>
                <dd className="min-w-0 break-words text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          {data.error && <div className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2 text-[13px] text-critical-text">{data.error}</div>}
          {data.request_content || data.response_content ? (
            <div className="space-y-3">
              {[
                ["Prompt", data.request_content],
                ["Respuesta", data.response_content],
              ].map(([label, text]) =>
                text ? (
                  <div key={label}>
                    <p className="mb-1 text-xs font-medium text-fg-3">{label}</p>
                    <pre className="scrollbar-thin max-h-48 overflow-auto rounded-lg border border-line bg-bg-subtle p-3 font-mono text-xs whitespace-pre-wrap text-fg-2">{text}</pre>
                  </div>
                ) : null,
              )}
            </div>
          ) : (
            <p className="text-xs text-fg-3">El contenido de prompts y respuestas no se guarda (LOG_REQUEST_CONTENT=false).</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function LogsPage() {
  const apps = useResource<Application[]>("/applications");
  const facets = useResource<{ models: string[]; endpoints: string[] }>("/logs/facets");
  const [filters, setFilters] = useState({ application_id: "", model: "", endpoint: "", status: "", from: "", to: "" });
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const params = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const logs = useResource<{ total: number; items: RequestLog[] }>(`/logs?${params}`, 15_000);

  const set = (key: keyof typeof filters) => (value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setOffset(0);
  };
  const active = Object.values(filters).some(Boolean);
  const total = logs.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Logs" description="Cada request a la API pública. Sin contenido de prompts ni respuestas, salvo que lo actives." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={filters.application_id} onChange={(e) => set("application_id")(e.target.value)} className="w-auto min-w-44" aria-label="Aplicación">
          <option value="">Todas las aplicaciones</option>
          {(apps.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select value={filters.model} onChange={(e) => set("model")(e.target.value)} className="w-auto min-w-36" aria-label="Modelo">
          <option value="">Todos los modelos</option>
          {(facets.data?.models ?? []).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Select value={filters.endpoint} onChange={(e) => set("endpoint")(e.target.value)} className="w-auto min-w-44" aria-label="Endpoint">
          <option value="">Todos los endpoints</option>
          {(facets.data?.endpoints ?? []).map((m) => (
            <option key={m}>{m}</option>
          ))}
        </Select>
        <Select value={filters.status} onChange={(e) => set("status")(e.target.value)} className="w-auto min-w-32" aria-label="Estado">
          <option value="">Todos los estados</option>
          <option value="success">Correctos</option>
          <option value="error">Errores</option>
        </Select>
        <Input type="date" value={filters.from} onChange={(e) => set("from")(e.target.value)} className="w-40" aria-label="Desde" />
        <Input type="date" value={filters.to} min={filters.from} onChange={(e) => set("to")(e.target.value)} className="w-40" aria-label="Hasta" />
        {active && (
          <Button
            size="sm"
            variant="ghost"
            icon={<X className="size-3.5" />}
            onClick={() => {
              setFilters({ application_id: "", model: "", endpoint: "", status: "", from: "", to: "" });
              setOffset(0);
            }}
          >
            Limpiar
          </Button>
        )}
      </div>

      <Card>
        {logs.loading && !logs.data ? (
          <LoadingState rows={6} />
        ) : logs.error ? (
          <ErrorState message={logs.error} onRetry={logs.reload} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={logs.data?.items ?? []}
              rowKey={(r) => r.id}
              onRowClick={(r) => setSelected(r.id)}
              dense
              empty={<EmptyState icon={<ScrollText className="size-5" />} title={active ? "Sin resultados para estos filtros" : "Todavía no hay requests registrados"} />}
            />
            {total > 0 && (
              <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-fg-3">
                <span className="tabular">
                  {formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE, total))} de {formatNumber(total)}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} icon={<ChevronLeft className="size-4" />} aria-label="Anterior" />
                  <Button size="sm" variant="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} icon={<ChevronRight className="size-4" />} aria-label="Siguiente" />
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {selected !== null && <Detail id={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
