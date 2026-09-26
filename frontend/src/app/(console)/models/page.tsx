"use client";

import { Boxes, Star } from "lucide-react";

import { Card, CardHeader, EmptyState, ErrorState, InlineError, LoadingState, PageHeader, StatusBadge, Tag } from "@/components/ui";
import { formatBytes, formatDate, relativeTime } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { ModelsResponse } from "@/lib/types";

export default function ModelsPage() {
  const { data, error, loading, reload } = useResource<ModelsResponse>("/models", 30_000);

  return (
    <>
      <PageHeader title="Modelos" description="Modelos instalados en Ollama, consultados en tiempo real. Nada de esta lista es estático." />
      {loading && !data ? (
        <Card>
          <LoadingState rows={2} />
        </Card>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={reload} />
        </Card>
      ) : data?.ollama_status !== "online" ? (
        <Card>
          <ErrorState message={`Ollama no responde: ${data?.error ?? "sin detalle"}. No se muestran modelos porque no se pudieron comprobar.`} onRetry={reload} />
        </Card>
      ) : (
        <div className="space-y-4">
          {data.default_installed === false && <InlineError message={`El modelo por defecto (${data.default_model}) no está instalado en Ollama.`} />}
          {!data.models.length ? (
            <Card>
              <EmptyState icon={<Boxes className="size-5" />} title="Ollama no tiene modelos instalados" description="Instala uno en el servidor con: ollama pull llama3.2:1b" />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.models.map((m) => (
                <Card key={m.name} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate font-mono text-[15px] font-semibold text-fg">{m.name}</h3>
                        {m.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-strong">
                            <Star className="size-3" /> Por defecto
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-fg-3">
                        {[m.family, m.parameter_size, m.quantization].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <StatusBadge status={m.allowed ? "online" : "disabled"} label={m.allowed ? "Available" : "No permitido"} />
                  </div>
                  <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
                    <div>
                      <dt className="text-fg-3">Tamaño</dt>
                      <dd className="tabular mt-0.5 text-sm font-medium text-fg">{formatBytes(m.size)}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-3">En memoria</dt>
                      <dd className="mt-0.5 text-sm font-medium text-fg">{m.loaded ? `Sí · hasta ${relativeTime(m.loaded_until).replace("dentro de ", "")}` : "No"}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-3">Actualizado</dt>
                      <dd className="mt-0.5 text-sm font-medium text-fg">{formatDate(m.modified_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex gap-1.5">
                    {m.format && <Tag>{m.format}</Tag>}
                    {m.digest && <Tag>sha {m.digest}</Tag>}
                  </div>
                </Card>
              ))}
            </div>
          )}
          <Card>
            <CardHeader title="Cómo se elige el modelo" />
            <div className="space-y-2 px-5 py-4 text-sm text-fg-2">
              <p>
                Si una petición no envía <code className="font-mono text-fg">model</code>, se usa <code className="font-mono text-fg">{data.default_model}</code> (variable{" "}
                <code className="font-mono text-fg">DEFAULT_MODEL</code>).
              </p>
              <p>
                Con 2 GB de RAM conviene usar un solo modelo: alternar modelos obliga a Ollama a cargarlos y descargarlos. Puedes restringirlos con{" "}
                <code className="font-mono text-fg">ALLOWED_MODELS</code>.
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
