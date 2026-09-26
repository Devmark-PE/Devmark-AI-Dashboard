"use client";

import { useState } from "react";

import { BarList } from "@/components/charts/BarList";
import { bucketLabel, TimeChart } from "@/components/charts/TimeChart";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, ErrorState, Input, LoadingState, PageHeader, Segmented, Select } from "@/components/ui";
import { compactNumber, formatMs, formatNumber, formatPercent } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application, Usage } from "@/lib/types";

type Range = "today" | "7d" | "30d" | "custom";

function isoDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function UsagePage() {
  const [range, setRange] = useState<Range>("7d");
  const [from, setFrom] = useState(isoDay(-13));
  const [to, setTo] = useState(isoDay());
  const [appId, setAppId] = useState("");
  const apps = useResource<Application[]>("/applications");

  const params = new URLSearchParams({ range });
  if (range === "custom") {
    params.set("from", from);
    params.set("to", to);
  }
  if (appId) params.set("application_id", appId);
  const usage = useResource<Usage>(`/usage?${params}`);
  const d = usage.data;

  return (
    <>
      <PageHeader title="Uso" description="Requests, tokens, latencia y errores de la API pública." />

      {/* Filtros: una sola fila sobre todo el contenido que afectan. */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Hoy" },
            { value: "7d", label: "7 días" },
            { value: "30d", label: "30 días" },
            { value: "custom", label: "Personalizado" },
          ]}
        />
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="Desde" />
            <span className="text-fg-3">→</span>
            <Input type="date" value={to} min={from} max={isoDay()} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="Hasta" />
          </div>
        )}
        <Select value={appId} onChange={(e) => setAppId(e.target.value)} className="w-auto min-w-48" aria-label="Aplicación">
          <option value="">Todas las aplicaciones</option>
          {(apps.data ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </div>

      {usage.loading && !d ? (
        <LoadingState />
      ) : usage.error ? (
        <Card>
          <ErrorState message={usage.error} onRetry={usage.reload} />
        </Card>
      ) : d ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Requests" value={formatNumber(d.totals.requests)} />
            <StatCard label="Tokens" value={compactNumber(d.totals.tokens)} detail={`${compactNumber(d.totals.prompt_tokens)} entrada · ${compactNumber(d.totals.completion_tokens)} salida`} />
            <StatCard label="Latencia media" value={d.totals.requests ? formatMs(d.totals.avg_latency_ms) : "—"} />
            <StatCard label="Errores" value={formatNumber(d.totals.errors)} detail={d.totals.requests ? `${formatPercent(d.totals.error_rate)} de las requests` : undefined} />
          </div>

          {/* Dos métricas de escala distinta → dos gráficos, nunca un eje doble. */}
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Requests" description={d.range.granularity === "hour" ? "Por hora" : "Por día"} />
              <div className="px-3 pt-4 pb-2">
                <TimeChart
                  ariaLabel="Requests en el periodo"
                  granularity={d.range.granularity}
                  timeZone={d.range.timezone}
                  points={d.series.map((p) => ({ bucket: p.bucket, value: p.requests }))}
                  tooltip={(i) => (
                    <p className="tabular text-fg-2">
                      <span className="text-fg">{formatNumber(d.series[i].requests)}</span> requests · {formatNumber(d.series[i].errors)} errores
                    </p>
                  )}
                />
              </div>
            </Card>
            <Card>
              <CardHeader title="Tokens" description={d.range.granularity === "hour" ? "Por hora" : "Por día"} />
              <div className="px-3 pt-4 pb-2">
                <TimeChart
                  kind="area"
                  ariaLabel="Tokens en el periodo"
                  granularity={d.range.granularity}
                  timeZone={d.range.timezone}
                  points={d.series.map((p) => ({ bucket: p.bucket, value: p.tokens }))}
                  tooltip={(i) => (
                    <p className="tabular text-fg-2">
                      <span className="text-fg">{formatNumber(d.series[i].tokens)}</span> tokens · latencia {d.series[i].requests ? formatMs(d.series[i].avg_latency_ms) : "—"}
                    </p>
                  )}
                />
              </div>
            </Card>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Por aplicación" description="Requests en el periodo" />
              <BarList
                format={formatNumber}
                items={d.by_application.map((a) => ({ key: a.application_id ?? "legacy", label: a.name, value: a.requests, detail: `${compactNumber(a.tokens)} tok` }))}
              />
            </Card>
            <Card>
              <CardHeader title="Por modelo" description="Requests en el periodo" />
              <BarList format={formatNumber} items={d.by_model.map((m) => ({ key: m.model, label: <code className="font-mono text-[13px]">{m.model}</code>, value: m.requests, detail: formatMs(m.avg_latency_ms) }))} />
            </Card>
          </div>

          <Card>
            <CardHeader title="Tabla" description="Mismos datos que los gráficos" />
            <div className="scrollbar-thin max-h-80 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-xs text-fg-3">
                    <th className="px-5 py-2 text-left font-medium">{d.range.granularity === "hour" ? "Hora" : "Día"}</th>
                    <th className="px-5 py-2 text-right font-medium">Requests</th>
                    <th className="px-5 py-2 text-right font-medium">Tokens</th>
                    <th className="px-5 py-2 text-right font-medium">Errores</th>
                    <th className="px-5 py-2 text-right font-medium">Latencia</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {d.series.map((p) => (
                    <tr key={p.bucket} className="border-b border-line text-fg-2 last:border-0">
                      <td className="px-5 py-2">
                        {bucketLabel(p.bucket, d.range.granularity, d.range.timezone)}
                      </td>
                      <td className="px-5 py-2 text-right">{formatNumber(p.requests)}</td>
                      <td className="px-5 py-2 text-right">{formatNumber(p.tokens)}</td>
                      <td className="px-5 py-2 text-right">{formatNumber(p.errors)}</td>
                      <td className="px-5 py-2 text-right">{p.requests ? formatMs(p.avg_latency_ms) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-fg-3">
            Límites y cuotas: ya puedes definir un límite por minuto en cada key o aplicación. Las cuotas mensuales de tokens están preparadas en la base de datos para una próxima versión.
          </p>
        </div>
      ) : null}
    </>
  );
}
