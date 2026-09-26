"use client";

import { Moon, Power, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import { Button, Card, ConfirmDialog, InlineError, StatusBadge, Tag, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatBytes, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";

interface AiPower {
  paused: boolean;
  changed_at: string | null;
  changed_by: string | null;
  loaded_models: string[];
  ollama: "online" | "offline";
  default_model: string;
  memory: { total: number; available: number } | null;
}

export const AI_POWER_EVENT = "devmark:ai-power";

/** Interruptor del modo reposo: pausar la IA libera la RAM del modelo; activarla lo vuelve a cargar. */
export function AiPowerCard() {
  const state = useResource<AiPower>("/ai-power", 30_000);
  const reload = state.reload;
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warming, setWarming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = state.data;

  // Tras activar, consulta cada 2 s hasta que el modelo esté cargado (máx. ~2 min).
  useEffect(() => {
    if (!warming) return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const next = await api<AiPower>("/ai-power");
        if (next.loaded_models.includes(next.default_model) || tries > 60) {
          setWarming(false);
          void reload();
        }
      } catch {
        /* se reintenta */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [warming, reload]);

  async function toggle(paused: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api<AiPower>("/ai-power", { method: "POST", json: { paused } });
      setConfirming(false);
      if (!paused) setWarming(true);
      void reload();
      window.dispatchEvent(new Event(AI_POWER_EVENT));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el estado");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return null;
  const loaded = s.loaded_models.length > 0;
  const freeRam = s.memory ? formatBytes(s.memory.available) : null;

  return (
    <Card className={cx("overflow-hidden", s.paused && "border-warning/30")}>
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cx("grid size-10 shrink-0 place-items-center rounded-xl border", s.paused ? "border-warning/30 bg-warning/10 text-warning" : "border-good/30 bg-good/10 text-good-text")}>
            {s.paused ? <Moon className="size-5" /> : <Zap className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">{s.paused ? "IA en modo reposo" : "IA activa"}</h2>
              {s.paused ? (
                <StatusBadge status="warning" label="En pausa" />
              ) : warming ? (
                <StatusBadge status="unknown" label="Cargando modelo…" />
              ) : (
                <StatusBadge status="online" label={loaded ? "Modelo en memoria" : "Lista (se carga al primer uso)"} />
              )}
            </div>
            <p className="mt-1 text-[13px] text-fg-3">
              {s.paused
                ? "El modelo está fuera de la RAM y la API responde «IA en pausa» (503). El dashboard sigue funcionando."
                : "Responde a tus aplicaciones. Pausa la IA cuando no la necesites para liberar la memoria del servidor."}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-3">
              {loaded && s.loaded_models.map((m) => <Tag key={m}>{m}</Tag>)}
              {freeRam && <span>RAM libre: {freeRam}</span>}
              {s.changed_at && (
                <span>
                  · {s.paused ? "Pausada" : "Activada"} {relativeTime(s.changed_at)}
                  {s.changed_by ? ` por ${s.changed_by}` : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        {s.paused ? (
          <Button variant="primary" icon={<Power className="size-4" />} loading={busy} onClick={() => void toggle(false)} className="shrink-0">
            Activar IA
          </Button>
        ) : (
          <Button variant="secondary" icon={<Moon className="size-4" />} onClick={() => setConfirming(true)} disabled={warming} className="shrink-0">
            Pausar IA
          </Button>
        )}
      </div>
      {error && (
        <div className="px-5 pb-4">
          <InlineError message={error} />
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        loading={busy}
        title="Pausar la IA"
        confirmLabel="Pausar IA"
        onClose={() => setConfirming(false)}
        onConfirm={() => void toggle(true)}
        description={
          <>
            Se descargará el modelo de la memoria (libera ~1,3 GB de RAM). Mientras esté en pausa, tus aplicaciones recibirán el error{" "}
            <code className="font-mono text-fg">503 ai_paused</code> y el Playground no responderá. Al activarla, el modelo tarda unos segundos en cargar.
          </>
        }
      />
    </Card>
  );
}
