"use client";

import { RefreshCw } from "lucide-react";

import { Button, Card, CardHeader, ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { SystemStatus } from "@/lib/types";

function Meter({ label, used, total }: { label: string; used: number; total: number }) {
  const ratio = total ? used / total : 0;
  const tone = ratio > 0.9 ? "bg-critical" : ratio > 0.75 ? "bg-warning" : "bg-series-1";
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-fg-2">{label}</span>
        <span className="tabular text-fg">
          {formatBytes(used)} <span className="text-fg-3">/ {formatBytes(total)}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3" role="meter" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.max(1, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

export default function SystemPage() {
  const { data, error, loading, reload } = useResource<SystemStatus>("/system", 30_000);

  return (
    <>
      <PageHeader
        title="Sistema"
        description="Comprobaciones reales de la infraestructura. Lo que no se puede verificar se muestra como «Sin comprobar», nunca como online."
        actions={
          <Button size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void reload()} loading={loading && !!data}>
            Comprobar
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingState label="Comprobando servicios…" />
      ) : error || !data ? (
        <Card>
          <ErrorState message={error ?? "Sin datos"} onRetry={reload} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <Card>
            <CardHeader title="Servicios" description={`Última comprobación: ${formatDateTime(data.checked_at)}`} />
            <ul className="divide-y divide-line">
              {data.checks.map((check) => (
                <li key={check.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">{check.label}</p>
                    <p className="truncate text-xs text-fg-3">{check.detail || "—"}</p>
                  </div>
                  {check.latency_ms !== null && <span className="tabular hidden text-xs text-fg-3 sm:inline">{check.latency_ms} ms</span>}
                  <StatusBadge status={check.status} label={check.id === "ollama" && check.status === "online" ? "Connected" : check.id === "https" && check.status === "online" ? "Active" : undefined} />
                </li>
              ))}
            </ul>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Servidor" description={`${data.host.hostname} · ${data.host.arch}`} />
              <div className="space-y-4 px-5 py-4">
                {data.host.memory && <Meter label="RAM" used={data.host.memory.total - data.host.memory.available} total={data.host.memory.total} />}
                {data.host.swap && data.host.swap.total > 0 && <Meter label="Swap" used={data.host.swap.total - data.host.swap.free} total={data.host.swap.total} />}
                {data.host.disk && <Meter label="Disco" used={data.host.disk.total - data.host.disk.free} total={data.host.disk.total} />}
              </div>
            </Card>
            <Card>
              <dl className="divide-y divide-line text-sm">
                {[
                  ["Carga (1/5/15 min)", data.host.load ? data.host.load.map((l) => l.toFixed(2)).join(" · ") : "—"],
                  ["CPUs", data.host.cpus ?? "—"],
                  ["Uptime", formatDuration(data.host.uptime_seconds)],
                  ["Python", data.host.python],
                  ["Ollama", data.versions.ollama ? `v${data.versions.ollama}` : "—"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between px-5 py-2.5">
                    <dt className="text-fg-3">{label}</dt>
                    <dd className="tabular text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
