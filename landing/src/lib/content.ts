// Textos de la página. Todo sale del README y de docs/ARQUITECTURA.md: no añadir cifras, precios ni clientes que no estén ahí.
import { API_BASE_URL, LLMS_URL } from "./site";

export const CURL = `curl ${API_BASE_URL}/chat/completions \\
  -H "Authorization: Bearer $DEVMARK_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"llama3.2:1b","messages":[{"role":"user","content":"Hola"}]}'`;

export const JS = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${API_BASE_URL}",
  apiKey: process.env.DEVMARK_API_KEY, // solo en el backend
});

const r = await client.chat.completions.create({
  model: "llama3.2:1b",
  messages: [{ role: "user", content: "Hola" }],
});`;

export const PY = `import os
from openai import OpenAI

client = OpenAI(
    base_url="${API_BASE_URL}",
    api_key=os.environ["DEVMARK_API_KEY"],  # solo en el backend
)

r = client.chat.completions.create(
    model="llama3.2:1b",
    messages=[{"role": "user", "content": "Hola"}],
)`;

export const TAGLINE = "Un modelo que corre en servidores propios, se conecta como cualquier API y responde con lo que sabe tu empresa.";

export const PILLARS = [
  { icon: "lock", title: "Privada", text: "El modelo corre en un servidor de DEVMARK con Ollama. Lo que preguntas no se envía a terceros." },
  { icon: "plug", title: "Compatible con OpenAI", text: "Misma API de chat y mismos SDK. Si tu app ya usa OpenAI, solo cambias la dirección base y la key." },
  { icon: "book", title: "Con tu propio conocimiento", text: "Sube tus documentos y las respuestas salen de tu información, indicando de dónde la sacó." },
] as const;

export const STEPS = [
  { title: "Crea una aplicación y su key", text: "En el dashboard, una API key por aplicación, con límite por minuto, permisos y expiración. Se muestra una sola vez." },
  { title: "Conéctala cambiando la base_url", text: `Tu código de OpenAI sigue igual: apunta a ${API_BASE_URL} y usa tu nueva key.` },
  { title: "Responde con tu conocimiento", text: "Sube documentos de texto, .md o .pdf a la aplicación. Cada respuesta usa los fragmentos relevantes y cita sus fuentes." },
] as const;

export const FEATURES = [
  { icon: "plug", title: "API tipo OpenAI", text: "POST /v1/chat/completions y GET /v1/models. Funciona con los SDK de OpenAI cambiando solo la dirección." },
  { icon: "key", title: "API keys por aplicación", text: "Cada app con su límite por minuto, permisos y expiración. Puedes revocar o regenerar una key con periodo de gracia." },
  { icon: "book", title: "Conocimiento (RAG)", text: "La IA responde con tus documentos, con búsqueda de texto completo en español, y devuelve las fuentes usadas." },
  { icon: "wrench", title: "Herramientas", text: "Consulta datos reales de tablas, APIs y páginas web, con credenciales cifradas y sin acceso a la red interna." },
  { icon: "flask", title: "Playground", text: "Chatea con el modelo desde el dashboard, con o sin documentos, sin API key ni código." },
  { icon: "activity", title: "Uso y logs sin prompts", text: "Peticiones, tokens, latencia y errores por app, key y modelo, sin guardar lo que se pregunta ni lo que se responde." },
] as const;

export const SECURITY = [
  { icon: "key", title: "Keys con huella", text: "Solo se guarda el hash de cada key (HMAC-SHA256) y su prefijo visible. Una API key no da acceso al dashboard." },
  { icon: "shield", title: "2FA en el administrador", text: "Verificación en dos pasos (TOTP) con códigos de recuperación de un solo uso." },
  { icon: "eyeoff", title: "Logs sin prompts", text: "Los registros no guardan lo que se pregunta ni lo que se responde." },
  { icon: "lock", title: "Secretos cifrados", text: "Las credenciales de las herramientas se guardan cifradas y el dashboard nunca las devuelve." },
  { icon: "network", title: "Modelo fuera de Internet", text: "Ollama, FastAPI y la base de datos no son accesibles desde fuera: todo entra por HTTPS con límites por IP." },
  { icon: "ban", title: "Bloqueo de accesos", text: "Tras 5 intentos fallidos de inicio de sesión el acceso se bloquea." },
] as const;

export const USE_CASES = [
  { icon: "chat", title: "Chatbots de atención", text: "Un asistente que contesta preguntas frecuentes con la información de tu negocio." },
  { icon: "file", title: "Asistentes internos con documentos", text: "Tu equipo consulta manuales, políticas o procedimientos y recibe respuestas con su fuente." },
  { icon: "wrench", title: "Automatizaciones con herramientas", text: "Un flujo que consulta una tabla o una API para responder con datos reales." },
] as const;

export const FAQ = [
  {
    q: "¿Qué modelo usa?",
    a: "Hoy usa llama3.2:1b, ejecutado con Ollama. Es un modelo compacto, pensado para un uso ligero. Las respuestas llegan completas, sin streaming.",
  },
  {
    q: "¿Dónde corre y se envían mis datos a terceros?",
    a: "El modelo corre en un servidor de DEVMARK y no es accesible desde Internet. Las preguntas no se envían a terceros para generar la respuesta. La base de datos (PostgreSQL en Supabase) guarda usuarios, aplicaciones, huellas de las keys, métricas y los documentos de conocimiento que subas.",
  },
  {
    q: "¿Qué se guarda de lo que escribo?",
    a: "Cada petición deja una fila con el endpoint, el modelo, los tokens, el tiempo y el estado. Los logs no guardan los prompts ni las respuestas.",
  },
  {
    q: "¿Cómo la conecto a mi aplicación?",
    a: "Con los SDK de OpenAI, cambiando la base_url a https://ai.devmarkpe.com/v1 y usando la API key de tu aplicación. La key va solo en el backend, nunca en el navegador ni en una app pública.",
  },
  {
    q: "¿Cómo la conecto con un agente de IA?",
    a: `Pídele a tu agente (Claude Code, Cursor, ChatGPT…) «conecta esta app a DEVMARK AI siguiendo ${LLMS_URL}». Esa guía pública explica la URL, el modelo, ejemplos, errores y reglas de seguridad.`,
  },
  {
    q: "¿Y si una key se filtra?",
    a: "La revocas o la regeneras desde el dashboard. Al regenerar, la anterior puede seguir funcionando 0 horas, 24 horas o 7 días para que cambies la key sin cortes.",
  },
  {
    q: "¿Puedo probarla sin escribir código?",
    a: "Sí. El Playground del dashboard permite chatear con el modelo, con o sin los documentos de una aplicación.",
  },
  {
    q: "¿Cuánto cuesta?",
    a: "Depende de lo que necesites. Cuéntale tu caso a un asesor y te orienta.",
  },
] as const;
