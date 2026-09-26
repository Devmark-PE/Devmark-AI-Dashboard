"use client";

import { BookOpen, ChevronDown, FlaskConical, RotateCcw, Send, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button, Card, CardHeader, Checkbox, CopyButton, Field, InlineError, Input, PageHeader, Select, Tag, Textarea, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatMs, formatNumber } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application, ModelsResponse, PlaygroundResponse } from "@/lib/types";

type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; result: PlaygroundResponse }
  | { role: "error"; content: string; retry: string };

const DEFAULT_SYSTEM = "Eres un asistente útil. Responde en español, de forma breve y clara.";

function Sources({ result }: { result: PlaygroundResponse }) {
  const [open, setOpen] = useState(false);
  const sources = result.rag?.sources ?? [];
  if (!result.rag) return null;
  if (!sources.length) return <p className="mt-2 text-xs text-warning">RAG activo, pero no se encontraron documentos relevantes: respondió sin contexto.</p>;
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline" aria-expanded={open}>
        <BookOpen className="size-3.5" /> {sources.length} fuente(s) usadas
        {result.rag.search_ms !== null && <span className="font-normal text-fg-3">· búsqueda {formatMs(result.rag.search_ms)}</span>}
        <ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ol className="mt-2 space-y-2">
          {sources.map((s, i) => (
            <li key={s.chunk_id} className="rounded-lg border border-line bg-bg-subtle p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-3">
                <span className="font-medium text-fg">
                  [{i + 1}] {s.title}
                </span>
                <span>fragmento #{s.ordinal + 1}</span>
                <Tag>relevancia {s.score.toFixed(3)}</Tag>
              </div>
              <p className="text-[12.5px] whitespace-pre-wrap text-fg-2">{s.content}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function PlaygroundPage() {
  const models = useResource<ModelsResponse>("/models");
  const apps = useResource<Application[]>("/applications");

  const [model, setModel] = useState("");
  const [appId, setAppId] = useState("");
  const [useRag, setUseRag] = useState(false);
  const [topK, setTopK] = useState(3);
  const [system, setSystem] = useState(DEFAULT_SYSTEM);
  const [temperature, setTemperature] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [keepHistory, setKeepHistory] = useState(true);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  const cancelled = useRef(false);

  const app = apps.data?.find((a) => a.id === appId) ?? null;

  useEffect(() => {
    if (!model && models.data?.models.length) setModel(models.data.models.find((m) => m.is_default)?.name ?? models.data.models[0].name);
  }, [models.data, model]);

  useEffect(() => {
    if (app) setTopK(app.rag_top_k);
    if (!app) setUseRag(false);
  }, [app]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 100);
    return () => window.clearInterval(timer);
  }, [busy]);

  const selectedModel = models.data?.models.find((m) => m.name === model);
  const willSwapModel = selectedModel && !selectedModel.loaded && models.data?.models.some((m) => m.loaded);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy || !model) return;
    const history = keepHistory
      ? turns.flatMap((t) => (t.role === "error" ? [] : [{ role: t.role, content: t.content }]))
      : [];
    const messages = [...(system.trim() ? [{ role: "system", content: system.trim() }] : []), ...history, { role: "user", content }];
    setTurns((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setBusy(true);
    cancelled.current = false;
    try {
      const result = await api<PlaygroundResponse>("/playground/chat", {
        method: "POST",
        json: {
          model,
          messages,
          temperature: temperature === "" ? null : Number(temperature),
          max_tokens: maxTokens === "" ? null : Number(maxTokens),
          application_id: appId || null,
          use_rag: useRag,
          top_k: topK,
        },
      });
      if (cancelled.current) return;
      setTurns((prev) => [...prev, { role: "assistant", content: result.content || "(respuesta vacía)", result }]);
      if (willSwapModel) void models.reload();
    } catch (err) {
      if (cancelled.current) return;
      setTurns((prev) => [...prev, { role: "error", content: err instanceof ApiError ? err.message : "Error inesperado", retry: content }]);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    // La generación sigue en el servidor hasta terminar; aquí solo se deja de esperar.
    cancelled.current = true;
    setBusy(false);
    setTurns((prev) => [...prev, { role: "error", content: "Cancelado: se dejó de esperar la respuesta.", retry: "" }]);
  }

  const totals = turns.reduce(
    (acc, t) => (t.role === "assistant" ? { tokens: acc.tokens + t.result.usage.total_tokens, ms: acc.ms + t.result.processing_ms, n: acc.n + 1 } : acc),
    { tokens: 0, ms: 0, n: 0 },
  );

  return (
    <>
      <PageHeader
        title="Playground"
        description="Prueba el modelo del servidor y el RAG de tus aplicaciones con tu sesión de administrador (sin API key). Las pruebas quedan en Logs como «/playground»."
      />
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        {/* ---------- Configuración ---------- */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Modelo" />
            <div className="space-y-3 px-5 py-4">
              <Field label="Modelo (desde Ollama)">
                {(id) => (
                  <Select id={id} value={model} onChange={(e) => setModel(e.target.value)} disabled={!models.data?.models.length}>
                    {(models.data?.models ?? []).map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                        {m.is_default ? " ★" : ""}
                        {m.loaded ? " · cargado" : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {models.data?.ollama_status === "offline" && <InlineError message={`Ollama no responde: ${models.data.error ?? ""}`} />}
              {willSwapModel && <p className="text-xs text-warning">Este modelo no está en memoria: la primera respuesta tardará más (Ollama debe cargarlo y descargar el actual).</p>}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Temperatura">{(id) => <Input id={id} type="number" min={0} max={2} step={0.1} value={temperature} onChange={(e) => setTemperature(e.target.value)} placeholder="auto" />}</Field>
                <Field label="Máx. tokens">{(id) => <Input id={id} type="number" min={1} max={8192} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} placeholder="auto" />}</Field>
              </div>
              <Field label="System prompt">{(id) => <Textarea id={id} rows={4} value={system} onChange={(e) => setSystem(e.target.value)} />}</Field>
              <Checkbox checked={keepHistory} onChange={setKeepHistory} label="Enviar historial" description="Desactívalo para probar cada pregunta por separado." />
            </div>
          </Card>

          <Card>
            <CardHeader title="Conocimiento (RAG)" />
            <div className="space-y-3 px-5 py-4">
              <Field label="Aplicación">
                {(id) => (
                  <Select id={id} value={appId} onChange={(e) => setAppId(e.target.value)}>
                    <option value="">Ninguna (sin documentos)</option>
                    {(apps.data ?? []).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.document_count} doc.
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Checkbox
                checked={useRag}
                onChange={(v) => setUseRag(v && !!app)}
                label="Usar documentos de la aplicación"
                description={app ? (app.document_count ? `Busca en ${app.document_count} documento(s) y añade los ${topK} fragmentos más relevantes.` : "Esta aplicación no tiene documentos todavía.") : "Elige una aplicación primero."}
              />
              {useRag && (
                <Field label="Fragmentos por pregunta">
                  {(id) => (
                    <Select id={id} value={String(topK)} onChange={(e) => setTopK(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
            </div>
          </Card>
        </div>

        {/* ---------- Chat ---------- */}
        <Card className="flex min-h-[70vh] flex-col lg:h-[calc(100dvh-11rem)]">
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                Chat <code className="font-mono text-xs font-normal text-fg-3">{model || "—"}</code>
                {useRag && app && <Tag>RAG · {app.name}</Tag>}
              </span>
            }
            description={totals.n ? `${totals.n} respuesta(s) · ${formatNumber(totals.tokens)} tokens · media ${formatMs(totals.ms / totals.n)}` : "Las respuestas muestran tiempo, tokens y las fuentes usadas."}
            action={
              <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setTurns([])} disabled={!turns.length || busy}>
                Limpiar
              </Button>
            }
          />
          <div ref={logRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
            {!turns.length && (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div className="mb-4 grid size-11 place-items-center rounded-xl border border-line bg-surface-2 text-fg-3">
                  <FlaskConical className="size-5" />
                </div>
                <h3 className="text-sm font-semibold text-fg">Prueba el modelo</h3>
                <p className="mt-1 max-w-sm text-[13px] text-fg-3">Elige una aplicación y activa «Usar documentos» para ver cómo responde con tu base de conocimiento.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {["Hola, ¿quién eres?", "¿Cuál es el horario de atención?", "¿Cuánto cuesta el servicio?"].map((s) => (
                    <Button key={s} size="sm" onClick={() => void send(s)} disabled={!model}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md border border-accent/25 bg-accent-soft px-3.5 py-2.5 text-sm whitespace-pre-wrap text-fg">{turn.content}</div>
                </div>
              ) : turn.role === "assistant" ? (
                <div key={i} className="max-w-[92%]">
                  <div className="rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-2.5 text-sm whitespace-pre-wrap text-fg">{turn.content}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3">
                    <Tag>{turn.result.model}</Tag>
                    <span className="tabular">{formatMs(turn.result.processing_ms)}</span>
                    {turn.result.load_ms > 500 && <span className="text-warning">carga del modelo {formatMs(turn.result.load_ms)}</span>}
                    <span className="tabular">
                      {formatNumber(turn.result.usage.prompt_tokens)} + {formatNumber(turn.result.usage.completion_tokens)} tokens
                    </span>
                    {turn.result.finish_reason === "length" && <span className="text-warning">cortada por máx. tokens</span>}
                    <CopyButton value={turn.content} variant="ghost" className="!h-6 !px-1.5 text-[11.5px]" label="Copiar" />
                  </div>
                  <Sources result={turn.result} />
                </div>
              ) : (
                <div key={i} className="max-w-[92%] rounded-xl border border-critical/30 bg-critical/10 px-3.5 py-2.5 text-sm text-critical-text">
                  {turn.content}
                  {turn.retry && (
                    <Button size="sm" variant="ghost" className="ml-2" onClick={() => void send(turn.retry)}>
                      Reintentar
                    </Button>
                  )}
                </div>
              ),
            )}
            {busy && (
              <div className="flex items-center gap-2 text-[13px] text-fg-3">
                <span className="inline-flex gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-3" />
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-3 [animation-delay:150ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-fg-3 [animation-delay:300ms]" />
                </span>
                Generando… <span className="tabular">{(elapsed / 1000).toFixed(1)} s</span>
              </div>
            )}
          </div>
          <form
            className="flex items-end gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              className="!min-h-10 max-h-40 resize-none"
              placeholder="Escribe un mensaje…"
              aria-label="Mensaje"
              title="Enter envía · Shift+Enter nueva línea"
            />
            {busy ? (
              <Button type="button" variant="danger" icon={<Square className="size-4" />} onClick={stop}>
                Detener
              </Button>
            ) : (
              <Button type="submit" variant="primary" icon={<Send className="size-4" />} disabled={!input.trim() || !model}>
                Enviar
              </Button>
            )}
          </form>
        </Card>
      </div>
    </>
  );
}
