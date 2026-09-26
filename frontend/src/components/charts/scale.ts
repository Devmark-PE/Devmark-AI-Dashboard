/** Escala "bonita" para el eje Y: máximo redondeado y 4 ticks limpios. */
export function niceScale(max: number, ticks = 4): { max: number; ticks: number[] } {
  if (max <= 0) return { max: ticks, ticks: Array.from({ length: ticks + 1 }, (_, i) => i) };
  const rough = max / ticks;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude;
  const niceMax = Math.ceil(max / step) * step;
  return { max: niceMax, ticks: Array.from({ length: Math.round(niceMax / step) + 1 }, (_, i) => i * step) };
}

export function compactTick(value: number): string {
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${+(value / 1_000).toFixed(1)}k`;
  return String(value);
}
