import type { ReactNode } from "react";

/** Ranking horizontal de una sola serie: la barra es el dato, el texto va en tinta, nunca en el color de la serie. */
export function BarList({ items, format, emptyLabel = "Sin datos" }: { items: { key: string; label: ReactNode; value: number; detail?: ReactNode }[]; format: (v: number) => string; emptyLabel?: string }) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (!items.length) return <p className="px-5 py-8 text-center text-sm text-fg-3">{emptyLabel}</p>;
  return (
    <ul className="space-y-3 px-5 py-4">
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-fg">{item.label}</span>
            <span className="tabular shrink-0 text-fg-2">
              {format(item.value)}
              {item.detail && <span className="ml-2 text-xs text-fg-3">{item.detail}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-3">
            <div className="h-1.5 rounded-full bg-series-1" style={{ width: `${max ? Math.max(2, (item.value / max) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
