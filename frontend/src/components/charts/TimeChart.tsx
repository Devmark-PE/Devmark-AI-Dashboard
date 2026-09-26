"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { compactTick, niceScale } from "./scale";

export interface TimePoint {
  bucket: string;
  value: number;
}

const HEIGHT = 200;
const PAD = { top: 12, right: 12, bottom: 26, left: 40 };

export function bucketLabel(iso: string, granularity: "hour" | "day", timeZone?: string): string {
  const date = new Date(iso);
  return granularity === "hour"
    ? date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone })
    : date.toLocaleDateString("es-PE", { day: "numeric", month: "short", timeZone });
}

/**
 * Gráfico temporal de UNA serie (sin eje doble): columnas o área.
 * Hover: columnas → cada columna es su propio objetivo; área → crosshair que se ajusta al punto más cercano.
 */
export function TimeChart({
  points,
  granularity,
  kind = "column",
  format = (v) => v.toLocaleString("es-PE"),
  tooltip,
  ariaLabel,
  timeZone,
}: {
  points: TimePoint[];
  granularity: "hour" | "day";
  kind?: "column" | "area";
  format?: (value: number) => string;
  tooltip?: (index: number) => ReactNode;
  ariaLabel: string;
  /** Zona horaria de los buckets (la del servidor), no la del navegador. */
  timeZone?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  // Ancho responsivo sin librerías.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, Math.floor(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { max, ticks } = useMemo(() => niceScale(Math.max(0, ...points.map((p) => p.value))), [points]);
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const n = Math.max(points.length, 1);
  const band = innerW / n;
  const barW = Math.min(24, Math.max(3, band - 2));
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const xCenter = (i: number) => PAD.left + band * i + band / 2;
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(innerW / 64)));

  const linePath = points.map((p, i) => `${i ? "L" : "M"}${xCenter(i)},${y(p.value)}`).join(" ");
  const areaPath = points.length ? `${linePath} L${xCenter(points.length - 1)},${y(0)} L${xCenter(0)},${y(0)} Z` : "";

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    if (kind !== "area") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - PAD.left;
    setHover(Math.min(n - 1, Math.max(0, Math.floor(x / band))));
  }

  const hovered = hover !== null ? points[hover] : null;
  const tooltipLeft = hover !== null ? Math.min(Math.max(xCenter(hover), 90), width - 90) : 0;

  return (
    <div ref={wrapRef} className="relative select-none">
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="block overflow-visible"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-[var(--text-3)] text-[11px]">
              {compactTick(t)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />

        {kind === "column" &&
          points.map((p, i) => {
            const h = Math.max(0, y(0) - y(p.value));
            const x = xCenter(i) - barW / 2;
            const r = Math.min(4, barW / 2, h);
            const active = hover === i;
            return (
              <g key={p.bucket}>
                {h > 0 && (
                  <path
                    d={`M${x},${y(0)} V${y(0) - h + r} Q${x},${y(0) - h} ${x + r},${y(0) - h} H${x + barW - r} Q${x + barW},${y(0) - h} ${x + barW},${y(0) - h + r} V${y(0)} Z`}
                    fill="var(--series-1)"
                    opacity={hover === null || active ? 1 : 0.55}
                  />
                )}
                {/* Objetivo de hover más grande que la barra. */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${bucketLabel(p.bucket, granularity, timeZone)}: ${format(p.value)}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
              </g>
            );
          })}

        {kind === "area" && points.length > 0 && (
          <>
            <path d={areaPath} fill="var(--series-1)" opacity={0.1} />
            <path d={linePath} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hovered && hover !== null && (
              <>
                <line x1={xCenter(hover)} x2={xCenter(hover)} y1={PAD.top} y2={y(0)} stroke="var(--axis)" strokeWidth={1} />
                <circle cx={xCenter(hover)} cy={y(hovered.value)} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} />
              </>
            )}
          </>
        )}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.bucket} x={xCenter(i)} y={HEIGHT - 6} textAnchor="middle" className="fill-[var(--text-3)] text-[11px]">
              {bucketLabel(p.bucket, granularity, timeZone)}
            </text>
          ) : null,
        )}
      </svg>

      {hovered && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-36 -translate-x-1/2 rounded-lg border border-line-strong bg-surface-3/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={{ left: tooltipLeft }}
        >
          <p className="mb-1 font-medium text-fg">{bucketLabel(hovered.bucket, granularity, timeZone)}</p>
          {tooltip ? tooltip(hover) : <p className="tabular text-fg-2">{format(hovered.value)}</p>}
        </div>
      )}
    </div>
  );
}
