"use client";

import { ArrowRight, BookOpen, Braces, CircleAlert, Gauge, KeyRound, Library, Play, Rocket, ShieldCheck, Terminal, Wrench } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button, Card, CopyButton, InlineError, Select, StatusBadge, Tag, Textarea, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { formatMs, formatNumber } from "@/lib/format";
import { useResource } from "@/lib/hooks";
import type { Application, ModelsResponse, PlatformSettings, PlaygroundResponse } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Resaltado de código ligero (sin dependencias)                         */
/* ------------------------------------------------------------------ */

type Lang = "bash" | "js" | "python" | "json";

const TOKEN_RULES: Record<Lang, [RegExp, string][]> = {
  json: [
    [/"(?:[^"\\]|\\.)*"(?=\s*:)/y, "text-[#a397ff]"],
    [/"(?:[^"\\]|\\.)*"/y, "text-[#3ecf8e]"],
    [/\b(?:true|false|null)\b/y, "text-[#f7a35c]"],
    [/-?\d+(?:\.\d+)?/y, "text-[#f7a35c]"],
  ],
  bash: [
    [/#.*/y, "text-fg-3 italic"],
    [/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/y, "text-[#3ecf8e]"],
    [/\$[A-Z_]+/y, "text-[#f7a35c]"],
    [/(?:^|\s)-{1,2}[A-Za-z-]+/y, "text-[#a397ff]"],
    [/\bcurl\b/y, "text-[#5aa8ff]"],
  ],
  js: [
    [/\/\/.*/y, "text-fg-3 italic"],
    [/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/y, "text-[#3ecf8e]"],
    [/\b(?:const|let|await|async|new|return|import|from|if|throw|for|of)\b/y, "text-[#a397ff]"],
    [/\b(?:true|false|null|undefined)\b|\b\d+\b/y, "text-[#f7a35c]"],
    [/\b[A-Za-z_]\w*(?=\()/y, "text-[#5aa8ff]"],
  ],
  python: [
    [/#.*/y, "text-fg-3 italic"],
    [/f?"(?:[^"\\]|\\.)*"|f?'(?:[^'\\]|\\.)*'/y, "text-[#3ecf8e]"],
    [/\b(?:import|from|as|def|return|with|for|in|if|print|raise)\b/y, "text-[#a397ff]"],
    [/\b(?:True|False|None)\b|\b\d+\b/y, "text-[#f7a35c]"],
    [/\b[A-Za-z_]\w*(?=\()/y, "text-[#5aa8ff]"],
  ],
};

function highlight(code: string, lang: Lang): ReactNode[] {
  const rules = TOKEN_RULES[lang];
  const out: ReactNode[] = [];
  let i = 0;
  let plain = "";
  while (i < code.length) {
    let matched = false;
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        if (plain) out.push(plain), (plain = "");
        out.push(
          <span key={i} className={cls}>
            {m[0]}
          </span>,
        );
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) plain += code[i++];
  }
  if (plain) out.push(plain);
  return out;
}

function CodeBlock({ code, lang, title }: { code: string; lang: Lang; title?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#0a0b0f]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="font-mono text-[11px] text-fg-3">{title ?? lang}</span>
        <CopyButton value={code} variant="ghost" className="!h-7 text-xs" />
      </div>
      <pre className="scrollbar-thin overflow-x-auto p-4 font-mono text-[12.5px] leading-relaxed text-[#e6e8ee]">
        <code>{highlight(code, lang)}</code>
      </pre>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ejemplos (se rellenan con la URL y el modelo reales)                 */
/* ------------------------------------------------------------------ */

const LANGS = [
  { id: "curl", label: "cURL", lang: "bash" },
  { id: "js", label: "JavaScript", lang: "js" },
  { id: "python", label: "Python", lang: "python" },
  { id: "openai-py", label: "OpenAI SDK · Python", lang: "python" },
  { id: "openai-js", label: "OpenAI SDK · Node", lang: "js" },
] as const;
type LangId = (typeof LANGS)[number]["id"];

function snippets(base: string, model: string): Record<LangId, string> {
  return {
    curl: `curl ${base}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DEVMARK_API_KEY" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "system", "content": "Eres el asistente de mi empresa." },
      { "role": "user", "content": "Hola" }
    ]
  }'`,
    js: `// Node 18+ o cualquier backend con fetch. Nunca uses la key en el navegador.
const response = await fetch("${base}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.DEVMARK_API_KEY}\`,
  },
  body: JSON.stringify({
    model: "${model}",
    messages: [{ role: "user", content: "Hola" }],
  }),
});

if (!response.ok) throw new Error(\`Devmark AI \${response.status}\`);
const data = await response.json();
console.log(data.choices[0].message.content);`,
    python: `import os
import requests

response = requests.post(
    "${base}/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['DEVMARK_API_KEY']}"},
    json={"model": "${model}", "messages": [{"role": "user", "content": "Hola"}]},
    timeout=120,
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])`,
    "openai-py": `# pip install openai
import os
from openai import OpenAI

client = OpenAI(base_url="${base}/v1", api_key=os.environ["DEVMARK_API_KEY"])

completion = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "Hola"}],
)
print(completion.choices[0].message.content)`,
    "openai-js": `// npm install openai
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "${base}/v1", apiKey: process.env.DEVMARK_API_KEY });

const completion = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Hola" }],
});
console.log(completion.choices[0].message.content);`,
  };
}

const RESPONSE = (model: string) => `{
  "id": "devmark-3f9c1e…",
  "object": "chat.completion",
  "created": 1790405230,
  "model": "${model}",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "¡Hola! ¿En qué puedo ayudarte?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 26, "completion_tokens": 10, "total_tokens": 36 },
  "processing_time": 1.42
}`;

/* ------------------------------------------------------------------ */
/* Piezas                                                               */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "inicio", label: "Inicio rápido", icon: Rocket },
  { id: "probar", label: "Probar ahora", icon: Play },
  { id: "auth", label: "Autenticación", icon: KeyRound },
  { id: "endpoints", label: "Endpoints", icon: Braces },
  { id: "rag", label: "Conocimiento (RAG)", icon: Library },
  { id: "tools", label: "Herramientas", icon: Wrench },
  { id: "limites", label: "Límites", icon: Gauge },
  { id: "errores", label: "Errores", icon: CircleAlert },
  { id: "seguridad", label: "Buenas prácticas", icon: ShieldCheck },
];

function Section({ id, title, icon: Icon, children, description }: { id: string; title: string; icon: typeof Rocket; children: ReactNode; description?: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-accent-strong">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-fg-2">{description}</p>}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Method({ method }: { method: "GET" | "POST" }) {
  return <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold", method === "GET" ? "bg-series-1/15 text-series-1" : "bg-accent-soft text-accent-strong")}>{method}</span>;
}

function Params({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2/60 text-left text-xs text-fg-3">
            <th className="px-4 py-2 font-medium">Campo</th>
            <th className="px-4 py-2 font-medium">Tipo</th>
            <th className="px-4 py-2 font-medium">Requerido</th>
            <th className="px-4 py-2 font-medium">Descripción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line text-fg-2">
          {rows.map(([name, type, required, desc]) => (
            <tr key={name}>
              <td className="px-4 py-2.5 font-mono text-[13px] whitespace-nowrap text-fg">{name}</td>
              <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-fg-3">{type}</td>
              <td className="px-4 py-2.5 text-xs">{required === "sí" ? <Tag>requerido</Tag> : <span className="text-fg-3">opcional</span>}</td>
              <td className="px-4 py-2.5 text-[13px]">{desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EndpointCard({ method, path, auth, title, children }: { method: "GET" | "POST"; path: string; auth: string; title: string; children: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Method method={method} />
        <code className="font-mono text-sm font-semibold text-fg">{path}</code>
        <Tag>{auth}</Tag>
      </div>
      <p className="mt-2 text-sm text-fg-2">{title}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Consola "Probar ahora" (usa tu sesión, no una API key)               */
/* ------------------------------------------------------------------ */

function TryIt({ models, defaultModel }: { models: string[]; defaultModel: string }) {
  const [model, setModel] = useState(defaultModel);
  const [message, setMessage] = useState("Hola, ¿qué puedes hacer por mi empresa?");
  const [result, setResult] = useState<PlaygroundResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setModel(defaultModel), [defaultModel]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api<PlaygroundResponse>("/playground/chat", { method: "POST", json: { model, messages: [{ role: "user", content: message }] } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error inesperado");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-2">
        <div className="space-y-3 border-b border-line p-5 lg:border-r lg:border-b-0">
          <div className="flex items-center gap-2">
            <Method method="POST" />
            <code className="font-mono text-[13px] text-fg">/v1/chat/completions</code>
          </div>
          <Select value={model} onChange={(e) => setModel(e.target.value)} aria-label="Modelo">
            {(models.length ? models : [defaultModel]).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Mensaje" />
          <Button variant="primary" icon={<Play className="size-4" />} loading={busy} onClick={run} disabled={!message.trim()}>
            Enviar petición
          </Button>
          <p className="text-xs text-fg-3">Usa tu sesión de administrador (como el Playground). Tus aplicaciones usan una API key con el mismo modelo.</p>
        </div>
        <div className="min-h-48 bg-[#0a0b0f] p-5">
          {busy ? (
            <p className="text-sm text-fg-3">Generando…</p>
          ) : error ? (
            <InlineError message={error} />
          ) : result ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-xs text-fg-3">
                <StatusBadge status="success" label="200 OK" />
                <span>{formatMs(result.processing_ms)}</span>
                <span>{formatNumber(result.usage.total_tokens)} tokens</span>
              </div>
              <pre className="font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-[#e6e8ee]">
                <code>
                  {highlight(
                    JSON.stringify({ model: result.model, choices: [{ message: { role: "assistant", content: result.content }, finish_reason: result.finish_reason }], usage: result.usage }, null, 2),
                    "json",
                  )}
                </code>
              </pre>
            </div>
          ) : (
            <p className="text-sm text-fg-3">La respuesta aparecerá aquí.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                               */
/* ------------------------------------------------------------------ */

export default function DocsPage() {
  const models = useResource<ModelsResponse>("/models");
  const apps = useResource<Application[]>("/applications");
  const settings = useResource<PlatformSettings>("/settings");
  const [status, setStatus] = useState<{ ollama: string; model: string } | null>(null);
  const [base, setBase] = useState("https://ai.devmarkpe.com");
  const [lang, setLang] = useState<LangId>("curl");
  const [active, setActive] = useState("inicio");

  const defaultModel = models.data?.default_model ?? "llama3.2:1b";
  const installed = models.data?.models.map((m) => m.name) ?? [];
  const code = useMemo(() => snippets(base, defaultModel), [base, defaultModel]);
  const langMeta = LANGS.find((l) => l.id === lang)!;

  useEffect(() => {
    setBase(settings.data?.public_base_url ?? window.location.origin);
  }, [settings.data]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("devmark-docs-lang") as LangId | null;
      if (saved && LANGS.some((l) => l.id === saved)) setLang(saved);
    } catch {
      /* sin almacenamiento local */
    }
    fetch("/status", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => setStatus({ ollama: d.ollama, model: d.model }))
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  function chooseLang(id: LangId) {
    setLang(id);
    try {
      localStorage.setItem("devmark-docs-lang", id);
    } catch {
      /* sin almacenamiento local */
    }
  }

  const ragApps = (apps.data ?? []).filter((a) => a.rag_enabled);

  return (
    <div className="grid gap-8 xl:grid-cols-[13rem_minmax(0,1fr)]">
      {/* Índice */}
      <nav className="hidden xl:block" aria-label="Contenido de la documentación">
        <div className="sticky top-20 space-y-0.5">
          <p className="mb-2 px-2.5 text-[11px] font-medium tracking-wider text-fg-3 uppercase">En esta página</p>
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={cx(
                "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                active === id ? "bg-surface-3 font-medium text-fg" : "text-fg-3 hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className={cx("size-3.5", active === id && "text-accent-strong")} /> {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="min-w-0 space-y-12">
        {/* Portada */}
        <header className="relative overflow-hidden rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(36rem 18rem at 100% 0%, rgba(139,124,255,.16), transparent 60%)" }} />
          <div className="relative">
            <div className="flex items-center gap-2 text-xs font-medium text-accent-strong">
              <BookOpen className="size-3.5" /> Documentación de la API
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Integra la IA de tu empresa en minutos</h1>
            <p className="mt-2 max-w-2xl text-sm text-fg-2">Compatible con el formato de OpenAI: si tu app ya usa OpenAI, basta con cambiar la URL y la key.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-lg border border-line-strong bg-bg-subtle py-1 pr-1 pl-3">
                <span className="shrink-0 text-xs whitespace-nowrap text-fg-3">Base URL</span>
                <code className="min-w-0 truncate font-mono text-[13px] text-fg">{base}/v1</code>
                <CopyButton value={`${base}/v1`} variant="ghost" className="!h-7" label="Copiar" />
              </span>
              {status ? (
                <StatusBadge status={status.ollama === "connected" ? "online" : "offline"} label={status.ollama === "connected" ? `Operativo · ${status.model}` : "Modelo no disponible"} />
              ) : (
                <StatusBadge status="unknown" label="Comprobando…" />
              )}
              {installed.length > 0 && <Tag>{installed.length} modelo(s): {installed.join(", ")}</Tag>}
            </div>
          </div>
        </header>

        <Section id="inicio" title="Inicio rápido" icon={Rocket} description="Tres pasos para la primera respuesta.">
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              ["1", "Crea una API key", <>En <Link href="/api-keys/" className="font-medium text-accent-strong hover:underline">API Keys</Link> elige la aplicación y copia la key (solo se muestra una vez).</>],
              ["2", "Guárdala como secreto", <>En el servidor de tu app: <code className="font-mono text-fg">DEVMARK_API_KEY=dmk_live_…</code> en su <code className="font-mono">.env</code>.</>],
              ["3", "Envía un mensaje", <>Usa el ejemplo de abajo en tu lenguaje. La respuesta sigue el formato de OpenAI.</>],
            ].map(([n, title, text]) => (
              <li key={String(n)} className="rounded-xl border border-line bg-surface p-4">
                <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">{n}</span>
                <p className="mt-3 text-sm font-medium text-fg">{title}</p>
                <p className="mt-1 text-[13px] text-fg-2">{text}</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Lenguaje">
            {LANGS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="tab"
                aria-selected={lang === l.id}
                onClick={() => chooseLang(l.id)}
                className={cx("h-8 rounded-lg px-3 text-[13px] font-medium transition-colors", lang === l.id ? "bg-accent text-accent-ink" : "border border-line bg-surface text-fg-2 hover:text-fg")}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="grid gap-4 2xl:grid-cols-2">
            <CodeBlock code={code[lang]} lang={langMeta.lang} title={`Petición · ${langMeta.label}`} />
            <CodeBlock code={RESPONSE(defaultModel)} lang="json" title="Respuesta · 200 OK" />
          </div>
        </Section>

        <Section id="probar" title="Probar ahora" icon={Play} description="Envía una petición real al modelo de tu servidor desde aquí.">
          <TryIt models={installed} defaultModel={defaultModel} />
        </Section>

        <Section id="auth" title="Autenticación" icon={KeyRound} description="Cada petición a /v1/* lleva una API key en la cabecera Authorization.">
          <CodeBlock code="Authorization: Bearer $DEVMARK_API_KEY" lang="bash" title="Cabecera" />
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["dmk_live_…", "Producción. Úsala solo en el backend de tus aplicaciones."],
              ["dmk_test_…", "Pruebas. Ideal para la app de testeo y entornos de desarrollo."],
              ["Revocación", "Si una key se filtra, revócala o regénérala: deja de funcionar al instante (401)."],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl border border-line bg-surface p-4">
                <p className="font-mono text-sm text-fg">{title}</p>
                <p className="mt-1 text-[13px] text-fg-2">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="endpoints" title="Endpoints" icon={Braces} description={<>Todos bajo <code className="font-mono text-fg">{base}</code>.</>}>
          <EndpointCard method="POST" path="/v1/chat/completions" auth="API key · chat" title="Genera una respuesta a partir de una conversación.">
            <Params
              rows={[
                ["messages", "array", "sí", "Conversación: objetos { role, content }. Roles: system, user, assistant."],
                ["model", "string", "no", `Modelo a usar. Por defecto: ${defaultModel}.`],
                ["temperature", "number 0–2", "no", "Creatividad. Bajo (0.2) = respuestas precisas; alto = variadas."],
                ["max_tokens", "integer", "no", "Longitud máxima de la respuesta."],
                ["top_p", "number 0–1", "no", "Muestreo por núcleo (alternativa a temperature)."],
                ["stop", "string | array", "no", "Texto(s) donde cortar la respuesta."],
                ["rag", "boolean", "no", "Extensión Devmark: fuerza (true) o desactiva (false) el RAG de la aplicación."],
                ["tools", "array", "no", "Function calling formato OpenAI: la respuesta trae tool_calls y tu app ejecuta la función."],
                ["server_tools", "boolean", "no", "Extensión Devmark: false desactiva las herramientas configuradas para la aplicación."],
              ]}
            />
            <p className="text-xs text-fg-3">El streaming (stream: true) no está disponible: siempre se devuelve la respuesta completa.</p>
          </EndpointCard>
          <div className="grid gap-4 lg:grid-cols-3">
            <EndpointCard method="GET" path="/v1/models" auth="API key · models" title="Modelos disponibles en formato OpenAI.">
              <CodeBlock code={`{ "object": "list", "data": [ { "id": "${defaultModel}", "object": "model" } ] }`} lang="json" title="Respuesta" />
            </EndpointCard>
            <EndpointCard method="GET" path="/status" auth="público" title="Estado del servicio y del modelo. Siempre 200.">
              <CodeBlock code={`{ "status": "online", "model": "${defaultModel}", "ollama": "connected" }`} lang="json" title="Respuesta" />
            </EndpointCard>
            <EndpointCard method="GET" path="/health" auth="público" title="Para monitoreo: 200 si el modelo responde, 503 si no.">
              <CodeBlock code={`{ "status": "healthy", "ollama": "connected" }`} lang="json" title="Respuesta" />
            </EndpointCard>
          </div>
        </Section>

        <Section id="rag" title="Conocimiento (RAG)" icon={Library} description="Respuestas basadas en los documentos de cada aplicación, sin cambiar tu código.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-fg-2">
              <p>
                Sube documentos en <Link href="/knowledge/" className="font-medium text-accent-strong hover:underline">Conocimiento (RAG)</Link> y activa el RAG de la aplicación. Cada pregunta hecha con
                sus keys incluirá automáticamente los fragmentos relevantes, y la respuesta traerá las fuentes.
              </p>
              <div className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xs font-medium text-fg-3">Aplicaciones con RAG activo</p>
                {apps.loading && !apps.data ? (
                  <p className="mt-2 text-sm text-fg-3">Cargando…</p>
                ) : ragApps.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {ragApps.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <span className="text-fg">{a.name}</span>
                        <span className="text-xs text-fg-3">{a.document_count} documento(s)</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-fg-3">
                    Ninguna todavía.{" "}
                    <Link href="/knowledge/" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
                      Configurar <ArrowRight className="size-3" />
                    </Link>
                  </p>
                )}
              </div>
            </div>
            <CodeBlock
              lang="json"
              title="Respuesta con RAG (extracto)"
              code={`{
  "choices": [ { "message": { "content": "La limpieza cuesta S/ 120 [1]." } } ],
  "rag": {
    "sources": [
      { "title": "Preguntas frecuentes", "ordinal": 0, "score": 0.1 }
    ]
  }
}`}
            />
          </div>
        </Section>

        <Section id="tools" title="Herramientas" icon={Wrench} description="La IA consulta datos reales de tus sistemas (Supabase, APIs, páginas web) mientras responde.">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 text-sm text-fg-2">
              <p>
                <strong className="text-fg">Del servidor (recomendado).</strong> Crea la herramienta en{" "}
                <Link href="/tools/" className="font-medium text-accent-strong hover:underline">Herramientas</Link> y asígnala a una aplicación. Con sus keys, la IA decide cuándo usarla,
                el servidor la ejecuta con credenciales cifradas y la respuesta indica qué herramientas se usaron. Tu app no cambia nada.
              </p>
              <p>
                <strong className="text-fg">Del cliente (OpenAI).</strong> Envía <code className="font-mono text-fg">tools</code> como con OpenAI: si el modelo quiere usar una, la respuesta trae{" "}
                <code className="font-mono text-fg">finish_reason: &quot;tool_calls&quot;</code>; tu app la ejecuta y reenvía el resultado con{" "}
                <code className="font-mono text-fg">role: &quot;tool&quot;</code> y <code className="font-mono text-fg">tool_call_id</code>.
              </p>
              <p className="text-xs text-fg-3">El modelo es pequeño: funciona mejor con 2–3 herramientas por aplicación y descripciones claras.</p>
            </div>
            <CodeBlock
              lang="json"
              title="Respuesta con herramientas del servidor (extracto)"
              code={`{
  "choices": [ { "message": { "content": "Ana Pérez es de Lima; su estado es «nuevo»." } } ],
  "tools": {
    "calls": [
      { "name": "buscar_lead", "arguments": { "nombre": "Ana" }, "ok": true, "ms": 180 }
    ]
  }
}`}
            />
          </div>
        </Section>

        <Section id="limites" title="Límites" icon={Gauge} description="Protegen el servidor y reparten la capacidad entre tus aplicaciones.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["20 / min", "Peticiones por IP a /v1 (ráfaga de 10)"],
              [settings.data ? String(settings.data.max_messages) : "—", "Mensajes por petición"],
              [settings.data ? formatNumber(settings.data.max_input_chars) : "—", "Caracteres de entrada por petición"],
              ["Por key", "Límite por minuto opcional en cada key o aplicación"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-line bg-surface p-4">
                <p className="text-xl font-semibold text-fg">{value}</p>
                <p className="mt-1 text-xs text-fg-3">{label}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="errores" title="Errores" icon={CircleAlert} description={<>Siempre en JSON: <code className="font-mono text-fg">{`{"error": {"message", "type", "code"}}`}</code> o <code className="font-mono text-fg">{`{"detail": "…"}`}</code>.</>}>
          <Card>
            <div className="scrollbar-thin overflow-x-auto">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-line text-fg-2">
                  {[
                    ["400", "Entrada inválida", "Mensaje demasiado largo o modelo no permitido."],
                    ["401", "No autenticado", "Key ausente, inválida, revocada o expirada."],
                    ["403", "Sin permiso", "La key no tiene el permiso o la aplicación está deshabilitada."],
                    ["404", "No encontrado", "El modelo no existe."],
                    ["422", "Formato incorrecto", "El JSON no cumple el esquema."],
                    ["429", "Límite excedido", "Demasiadas peticiones: espera y reintenta con backoff."],
                    ["503 / 504", "Modelo no disponible", "El modelo no responde o tardó demasiado: reintenta."],
                  ].map(([code, title, text]) => (
                    <tr key={code}>
                      <td className="w-24 px-5 py-3 font-mono text-fg">{code}</td>
                      <td className="px-5 py-3 font-medium whitespace-nowrap text-fg">{title}</td>
                      <td className="px-5 py-3">{text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Section>

        <Section id="seguridad" title="Buenas prácticas" icon={ShieldCheck}>
          <ul className="grid gap-3 md:grid-cols-2">
            {[
              [Terminal, "La key solo en el backend", "Nunca en JavaScript del navegador ni en apps móviles: cualquiera podría copiarla."],
              [KeyRound, "Una key por aplicación y entorno", "Así puedes revocar una sin afectar a las demás y ver el uso de cada una."],
              [ShieldCheck, "Rota las keys periódicamente", "Usa «Regenerar key» con periodo de gracia para cambiarla sin cortes."],
              [CircleAlert, "Reintentos con backoff", "Ante 429/503/504 espera 1 s, 2 s, 4 s… antes de reintentar."],
            ].map(([Icon, title, text]) => {
              const I = Icon as typeof Terminal;
              return (
                <li key={title as string} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
                  <I className="mt-0.5 size-4 shrink-0 text-accent-strong" />
                  <span>
                    <span className="block text-sm font-medium text-fg">{title as string}</span>
                    <span className="block text-[13px] text-fg-2">{text as string}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </div>
  );
}
