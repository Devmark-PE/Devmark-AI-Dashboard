"use client";

import { useState } from "react";

import { Card, CardHeader, CopyButton, PageHeader, Segmented, Tag } from "@/components/ui";

const BASE = "https://ai.devmarkpe.com";

const SNIPPETS = {
  curl: `curl ${BASE}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DEVMARK_API_KEY" \\
  -d '{
    "model": "llama3.2:1b",
    "messages": [
      { "role": "user", "content": "Hola" }
    ],
    "stream": false
  }'`,
  javascript: `const response = await fetch("${BASE}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: \`Bearer \${process.env.DEVMARK_API_KEY}\`,
  },
  body: JSON.stringify({
    model: "llama3.2:1b",
    messages: [{ role: "user", content: "Hola" }],
  }),
});

if (!response.ok) throw new Error(\`Devmark AI: \${response.status}\`);
const data = await response.json();
console.log(data.choices[0].message.content);`,
  python: `import os
import requests

response = requests.post(
    "${BASE}/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['DEVMARK_API_KEY']}"},
    json={
        "model": "llama3.2:1b",
        "messages": [{"role": "user", "content": "Hola"}],
    },
    timeout=120,
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])`,
  openai: `# pip install openai
import os
from openai import OpenAI

client = OpenAI(
    base_url="${BASE}/v1",
    api_key=os.environ["DEVMARK_API_KEY"],
)

completion = client.chat.completions.create(
    model="llama3.2:1b",
    messages=[{"role": "user", "content": "Hola"}],
)
print(completion.choices[0].message.content)`,
};

const RESPONSE = `{
  "id": "devmark-3f9c1e…",
  "object": "chat.completion",
  "created": 1790405230,
  "model": "llama3.2:1b",
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

function Code({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative">
      <pre className="scrollbar-thin overflow-x-auto rounded-xl border border-line bg-bg-subtle p-4 font-mono text-[12.5px] leading-relaxed text-fg-2">
        <code data-lang={lang}>{code}</code>
      </pre>
      <div className="absolute top-2.5 right-2.5">
        <CopyButton value={code} variant="ghost" />
      </div>
    </div>
  );
}

function Endpoint({ method, path, auth, children }: { method: string; path: string; auth: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${method === "GET" ? "bg-series-1/15 text-series-1" : "bg-accent-soft text-accent-strong"}`}>{method}</span>
        <code className="font-mono text-sm text-fg">{path}</code>
        <Tag>{auth}</Tag>
      </div>
      <div className="mt-2 text-[13px] text-fg-2">{children}</div>
    </div>
  );
}

export default function DocsPage() {
  const [lang, setLang] = useState<keyof typeof SNIPPETS>("curl");

  return (
    <div className="max-w-4xl">
      <PageHeader title="Documentación" description="Cómo consumir la API de Devmark AI desde tus aplicaciones. Compatible con el formato de OpenAI." />

      <div className="space-y-5">
        <Card>
          <CardHeader title="Autenticación" />
          <div className="space-y-3 px-5 py-4 text-sm text-fg-2">
            <p>
              Todas las peticiones a <code className="font-mono text-fg">/v1/*</code> requieren una API key en la cabecera <code className="font-mono text-fg">Authorization</code>:
            </p>
            <Code code={"Authorization: Bearer YOUR_API_KEY"} />
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Las keys tienen el formato <code className="font-mono text-fg">dmk_live_…</code> (producción) o <code className="font-mono text-fg">dmk_test_…</code> (pruebas). Créalas en <strong className="text-fg">API Keys</strong>.
              </li>
              <li>Úsalas solo desde tu backend. Nunca las incluyas en código que se ejecute en el navegador o en una app móvil.</li>
              <li>
                Si una key se filtra, revócala en el dashboard: deja de funcionar al instante con <code className="font-mono text-fg">401</code>.
              </li>
            </ul>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ejemplo: chat completions" description="Guarda la key en la variable de entorno DEVMARK_API_KEY." action={<Segmented value={lang} onChange={setLang} options={[{ value: "curl", label: "cURL" }, { value: "javascript", label: "JavaScript" }, { value: "python", label: "Python" }, { value: "openai", label: "OpenAI SDK" }]} />} />
          <div className="space-y-4 px-5 py-4">
            <Code code={SNIPPETS[lang]} lang={lang} />
            <div>
              <p className="mb-2 text-[13px] font-medium text-fg-2">Respuesta</p>
              <Code code={RESPONSE} lang="json" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Endpoints" description={BASE} />
          <Endpoint method="POST" path="/v1/chat/completions" auth="API key · chat">
            <p>Genera una respuesta. Cuerpo: <code className="font-mono">model</code> (opcional, por defecto llama3.2:1b), <code className="font-mono">messages</code> (roles system, user, assistant), y opcionalmente <code className="font-mono">temperature</code>, <code className="font-mono">top_p</code>, <code className="font-mono">max_tokens</code>, <code className="font-mono">stop</code>.</p>
            <p className="mt-1 text-fg-3">Streaming aún no está disponible: con <code className="font-mono">stream: true</code> se devuelve la respuesta completa.</p>
          </Endpoint>
          <Endpoint method="GET" path="/v1/models" auth="API key · models">
            <p>Lista los modelos disponibles en formato OpenAI (<code className="font-mono">{`{"object": "list", "data": [...]}`}</code>).</p>
          </Endpoint>
          <Endpoint method="GET" path="/health" auth="público">
            <p>
              Estado del servicio. <code className="font-mono">200 {`{"status":"healthy","ollama":"connected"}`}</code> o <code className="font-mono">503</code> si el modelo no está disponible.
            </p>
          </Endpoint>
        </Card>

        <Card>
          <CardHeader title="Errores" />
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-line text-fg-2">
                {[
                  ["400", "Entrada inválida (demasiado larga, modelo no permitido)"],
                  ["401", "API key ausente, inválida, revocada o expirada"],
                  ["403", "La key no tiene permiso para el endpoint, o la aplicación está deshabilitada"],
                  ["404", "El modelo no existe"],
                  ["422", "JSON con formato incorrecto"],
                  ["429", "Límite de peticiones excedido: espera y reintenta"],
                  ["503 / 504", "El modelo no está disponible o tardó demasiado: reintenta con backoff"],
                ].map(([code, text]) => (
                  <tr key={code}>
                    <td className="w-28 px-5 py-2.5 font-mono text-fg">{code}</td>
                    <td className="px-5 py-2.5">{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
