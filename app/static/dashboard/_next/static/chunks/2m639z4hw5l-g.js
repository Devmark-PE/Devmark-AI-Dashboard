(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,11588,e=>{"use strict";var s=e.i(43476),o=e.i(71645),a=e.i(17658);let t="https://ai.devmarkpe.com",n={curl:`curl ${t}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $DEVMARK_API_KEY" \\
  -d '{
    "model": "llama3.2:1b",
    "messages": [
      { "role": "user", "content": "Hola" }
    ],
    "stream": false
  }'`,javascript:`const response = await fetch("${t}/v1/chat/completions", {
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
console.log(data.choices[0].message.content);`,python:`import os
import requests

response = requests.post(
    "${t}/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['DEVMARK_API_KEY']}"},
    json={
        "model": "llama3.2:1b",
        "messages": [{"role": "user", "content": "Hola"}],
    },
    timeout=120,
)
response.raise_for_status()
print(response.json()["choices"][0]["message"]["content"])`,openai:`# pip install openai
import os
from openai import OpenAI

client = OpenAI(
    base_url="${t}/v1",
    api_key=os.environ["DEVMARK_API_KEY"],
)

completion = client.chat.completions.create(
    model="llama3.2:1b",
    messages=[{"role": "user", "content": "Hola"}],
)
print(completion.choices[0].message.content)`},l=`{
  "id": "devmark-3f9c1e…",
  "object": "chat.completion",
  "created": 1790405230,
  "model": "llama3.2:1b",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "\xa1Hola! \xbfEn qu\xe9 puedo ayudarte?" },
      "finish_reason": "stop"
    }
  ],
  "usage": { "prompt_tokens": 26, "completion_tokens": 10, "total_tokens": 36 },
  "processing_time": 1.42
}`;function i({code:e,lang:o}){return(0,s.jsxs)("div",{className:"relative",children:[(0,s.jsx)("pre",{className:"scrollbar-thin overflow-x-auto rounded-xl border border-line bg-bg-subtle p-4 font-mono text-[12.5px] leading-relaxed text-fg-2",children:(0,s.jsx)("code",{"data-lang":o,children:e})}),(0,s.jsx)("div",{className:"absolute top-2.5 right-2.5",children:(0,s.jsx)(a.CopyButton,{value:e,variant:"ghost"})})]})}function c({method:e,path:o,auth:t,children:n}){return(0,s.jsxs)("div",{className:"border-b border-line px-5 py-4 last:border-0",children:[(0,s.jsxs)("div",{className:"flex flex-wrap items-center gap-2",children:[(0,s.jsx)("span",{className:`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold ${"GET"===e?"bg-series-1/15 text-series-1":"bg-accent-soft text-accent-strong"}`,children:e}),(0,s.jsx)("code",{className:"font-mono text-sm text-fg",children:o}),(0,s.jsx)(a.Tag,{children:t})]}),(0,s.jsx)("div",{className:"mt-2 text-[13px] text-fg-2",children:n})]})}e.s(["default",0,function(){let[e,r]=(0,o.useState)("curl");return(0,s.jsxs)("div",{className:"max-w-4xl",children:[(0,s.jsx)(a.PageHeader,{title:"Documentación",description:"Cómo consumir la API de Devmark AI desde tus aplicaciones. Compatible con el formato de OpenAI."}),(0,s.jsxs)("div",{className:"space-y-5",children:[(0,s.jsxs)(a.Card,{children:[(0,s.jsx)(a.CardHeader,{title:"Autenticación"}),(0,s.jsxs)("div",{className:"space-y-3 px-5 py-4 text-sm text-fg-2",children:[(0,s.jsxs)("p",{children:["Todas las peticiones a ",(0,s.jsx)("code",{className:"font-mono text-fg",children:"/v1/*"})," requieren una API key en la cabecera ",(0,s.jsx)("code",{className:"font-mono text-fg",children:"Authorization"}),":"]}),(0,s.jsx)(i,{code:"Authorization: Bearer YOUR_API_KEY"}),(0,s.jsxs)("ul",{className:"list-disc space-y-1 pl-5",children:[(0,s.jsxs)("li",{children:["Las keys tienen el formato ",(0,s.jsx)("code",{className:"font-mono text-fg",children:"dmk_live_…"})," (producción) o ",(0,s.jsx)("code",{className:"font-mono text-fg",children:"dmk_test_…"})," (pruebas). Créalas en ",(0,s.jsx)("strong",{className:"text-fg",children:"API Keys"}),"."]}),(0,s.jsx)("li",{children:"Úsalas solo desde tu backend. Nunca las incluyas en código que se ejecute en el navegador o en una app móvil."}),(0,s.jsxs)("li",{children:["Si una key se filtra, revócala en el dashboard: deja de funcionar al instante con ",(0,s.jsx)("code",{className:"font-mono text-fg",children:"401"}),"."]})]})]})]}),(0,s.jsxs)(a.Card,{children:[(0,s.jsx)(a.CardHeader,{title:"Ejemplo: chat completions",description:"Guarda la key en la variable de entorno DEVMARK_API_KEY.",action:(0,s.jsx)(a.Segmented,{value:e,onChange:r,options:[{value:"curl",label:"cURL"},{value:"javascript",label:"JavaScript"},{value:"python",label:"Python"},{value:"openai",label:"OpenAI SDK"}]})}),(0,s.jsxs)("div",{className:"space-y-4 px-5 py-4",children:[(0,s.jsx)(i,{code:n[e],lang:e}),(0,s.jsxs)("div",{children:[(0,s.jsx)("p",{className:"mb-2 text-[13px] font-medium text-fg-2",children:"Respuesta"}),(0,s.jsx)(i,{code:l,lang:"json"})]})]})]}),(0,s.jsxs)(a.Card,{children:[(0,s.jsx)(a.CardHeader,{title:"Endpoints",description:t}),(0,s.jsxs)(c,{method:"POST",path:"/v1/chat/completions",auth:"API key · chat",children:[(0,s.jsxs)("p",{children:["Genera una respuesta. Cuerpo: ",(0,s.jsx)("code",{className:"font-mono",children:"model"})," (opcional, por defecto llama3.2:1b), ",(0,s.jsx)("code",{className:"font-mono",children:"messages"})," (roles system, user, assistant), y opcionalmente ",(0,s.jsx)("code",{className:"font-mono",children:"temperature"}),", ",(0,s.jsx)("code",{className:"font-mono",children:"top_p"}),", ",(0,s.jsx)("code",{className:"font-mono",children:"max_tokens"}),", ",(0,s.jsx)("code",{className:"font-mono",children:"stop"}),"."]}),(0,s.jsxs)("p",{className:"mt-1 text-fg-3",children:["Streaming aún no está disponible: con ",(0,s.jsx)("code",{className:"font-mono",children:"stream: true"})," se devuelve la respuesta completa."]})]}),(0,s.jsx)(c,{method:"GET",path:"/v1/models",auth:"API key · models",children:(0,s.jsxs)("p",{children:["Lista los modelos disponibles en formato OpenAI (",(0,s.jsx)("code",{className:"font-mono",children:'{"object": "list", "data": [...]}'}),")."]})}),(0,s.jsx)(c,{method:"GET",path:"/health",auth:"público",children:(0,s.jsxs)("p",{children:["Estado del servicio. ",(0,s.jsxs)("code",{className:"font-mono",children:["200 ",'{"status":"healthy","ollama":"connected"}']})," o ",(0,s.jsx)("code",{className:"font-mono",children:"503"})," si el modelo no está disponible."]})})]}),(0,s.jsxs)(a.Card,{children:[(0,s.jsx)(a.CardHeader,{title:"Errores"}),(0,s.jsx)("div",{className:"scrollbar-thin overflow-x-auto",children:(0,s.jsx)("table",{className:"w-full text-sm",children:(0,s.jsx)("tbody",{className:"divide-y divide-line text-fg-2",children:[["400","Entrada inválida (demasiado larga, modelo no permitido)"],["401","API key ausente, inválida, revocada o expirada"],["403","La key no tiene permiso para el endpoint, o la aplicación está deshabilitada"],["404","El modelo no existe"],["422","JSON con formato incorrecto"],["429","Límite de peticiones excedido: espera y reintenta"],["503 / 504","El modelo no está disponible o tardó demasiado: reintenta con backoff"]].map(([e,o])=>(0,s.jsxs)("tr",{children:[(0,s.jsx)("td",{className:"w-28 px-5 py-2.5 font-mono text-fg",children:e}),(0,s.jsx)("td",{className:"px-5 py-2.5",children:o})]},e))})})})]})]})]})}])}]);