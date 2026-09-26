const LOCALE = "es-PE";

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat(LOCALE).format(value);
}

export function compactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (Math.abs(value) < 10_000) return formatNumber(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toLocaleString(LOCALE, { maximumFractionDigits: ratio < 0.01 && ratio > 0 ? 2 : 1 })}%`;
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString(LOCALE, { maximumFractionDigits: ms < 10_000 ? 2 : 1 })} s`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${value.toLocaleString(LOCALE, { maximumFractionDigits: unit >= 3 ? 1 : 0 })} ${units[unit]}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(LOCALE, { dateStyle: "medium" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? -1 : 1;
  if (abs < 45) return diff >= 0 ? "hace unos segundos" : "en unos segundos";
  if (abs < 3600) return rtf.format(sign * Math.round(abs / 60), "minute");
  if (abs < 86400) return rtf.format(sign * Math.round(abs / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(sign * Math.round(abs / 86400), "day");
  return formatDate(iso);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
