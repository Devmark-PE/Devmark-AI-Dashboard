"use client";

import type { Column } from "@/components/ui/DataTable";
import { StatusBadge, Tag } from "@/components/ui";
import { formatMs, formatNumber, formatTime } from "@/lib/format";
import type { RequestLog } from "@/lib/types";

export const requestColumns: Column<RequestLog>[] = [
  { key: "time", header: "Hora", cell: (r) => <span className="tabular whitespace-nowrap text-fg-2">{formatTime(r.created_at)}</span> },
  {
    key: "app",
    header: "Aplicación",
    cell: (r) => (
      <div className="min-w-32">
        <p className="text-fg">{r.application_name ?? "—"}</p>
        {r.key_prefix && <p className="font-mono text-[11px] text-fg-3">{r.key_prefix === "legacy" ? "key .env" : `${r.key_prefix}…`}</p>}
      </div>
    ),
  },
  { key: "endpoint", header: "Endpoint", hideOnMobile: true, cell: (r) => <code className="font-mono text-xs whitespace-nowrap text-fg-2">{r.endpoint}</code> },
  { key: "model", header: "Modelo", hideOnMobile: true, cell: (r) => (r.model ? <Tag>{r.model}</Tag> : <span className="text-fg-3">—</span>) },
  { key: "tokens", header: "Tokens", align: "right", cell: (r) => formatNumber(r.total_tokens) },
  { key: "latency", header: "Tiempo", align: "right", cell: (r) => formatMs(r.processing_ms) },
  { key: "status", header: "Estado", align: "right", cell: (r) => <StatusBadge status={r.status} label={String(r.status_code)} /> },
];

