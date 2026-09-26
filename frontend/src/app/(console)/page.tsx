"use client";

import { Activity, ArrowRight, Clock, Cpu, Gauge, Hash, Server, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { TimeChart } from "@/components/charts/TimeChart";
import { requestColumns } from "@/components/RequestColumns";
import { DataTable } from "@/components/ui/DataTable";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui";
import { compactNumber, formatMs, formatNumber, formatPercent } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Overview } from "@/lib/types";

export default function DashboardPage() {
  const { data, error, loading, reload } = useResource<Overview>("/overview", 30_000);

  if (loading && !data) return <LoadingState label="Cargando métricas…" />;
  if (error || !data) return <ErrorState message={error ?? "Sin datos"} onRetry={reload} />;

  const t = data.today;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">Dashboard</h1>
          <p className="mt-1 text-sm text-fg-2">Estado de la plataforma y actividad de hoy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]">
            <Server className="size-3.5 text-fg-3" /> API <StatusBadge status={data.api_status} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]">
            <Cpu className="size-3.5 text-fg-3" /> Ollama <StatusBadge status={data.ollama_status} label={data.ollama_status === "online" ? "Connected" : undefined} />
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]">
            <span className="text-fg-3">Modelo</span> <code className="font-mono text-fg">{data.default_model}</code>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Requests hoy" value={formatNumber(t.requests)} icon={<Activity className="size-4" />} detail={`${compactNumber(data.total_requests)} en total`} />
        <StatCard label="Tokens hoy" value={compactNumber(t.tokens)} icon={<Hash className="size-4" />} detail={`${compactNumber(t.prompt_tokens)} entrada · ${compactNumber(t.completion_tokens)} salida`} />
        <StatCard label="Tiempo medio" value={t.requests ? formatMs(t.avg_latency_ms) : "—"} icon={<Clock className="size-4" />} detail="Por request, hoy" />
        <StatCard label="Tasa de error" value={t.requests ? formatPercent(t.error_rate) : "—"} icon={<TriangleAlert className="size-4" />} detail={`${formatNumber(t.errors)} ${t.errors === 1 ? "error" : "errores"} hoy`} />
        <StatCard label="Total histórico" value={compactNumber(data.total_requests)} icon={<Gauge className="size-4" />} detail="Requests registrados" className="col-span-2 lg:col-span-1" />
      </div>

      <Card>
        <CardHeader title="Requests por hora" description="Hoy, en tu zona horaria" action={<Link href="/usage/" className="text-[13px] font-medium text-accent-strong hover:underline">Ver uso →</Link>} />
        <div className="px-3 pt-4 pb-2">
          <TimeChart
            ariaLabel="Requests por hora hoy"
            granularity="hour"
            timeZone={data.timezone}
            points={data.today_series.map((p) => ({ bucket: p.bucket, value: p.requests }))}
            tooltip={(i) => {
              const p = data.today_series[i];
              return (
                <dl className="tabular grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-fg-2">
                  <dt>Requests</dt>
                  <dd className="text-right text-fg">{formatNumber(p.requests)}</dd>
                  <dt>Tokens</dt>
                  <dd className="text-right">{formatNumber(p.tokens)}</dd>
                  <dt>Errores</dt>
                  <dd className="text-right">{formatNumber(p.errors)}</dd>
                  <dt>Latencia media</dt>
                  <dd className="text-right">{p.requests ? formatMs(p.avg_latency_ms) : "—"}</dd>
                </dl>
              );
            }}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Requests recientes" action={<Link href="/logs/" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline">Ver logs <ArrowRight className="size-3.5" /></Link>} />
        <DataTable
          columns={requestColumns}
          rows={data.recent_requests}
          rowKey={(r) => r.id}
          dense
          empty={<EmptyState title="Todavía no hay requests" description="Cuando una aplicación use su API key, las peticiones aparecerán aquí." />}
        />
      </Card>
    </div>
  );
}
