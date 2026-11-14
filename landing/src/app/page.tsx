import {
  Activity, ArrowRight, Ban, BookOpen, ChevronDown, ExternalLink, EyeOff, FileText, FlaskConical,
  KeyRound, Lock, MessageCircle, Network, Plug, ShieldCheck, Wrench, type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { CodeTabs } from "@/components/CodeTabs";
import { Logo } from "@/components/Logo";
import { Reveal, Tagline } from "@/components/Reveal";
import { CURL, FAQ, FEATURES, JS, PILLARS, PY, SECURITY, STEPS, TAGLINE, USE_CASES } from "@/lib/content";
import { API_BASE_URL, CTA_HREF, CTA_LABEL, DASHBOARD_URL, EMAIL, HOURS, LLMS_URL, PRESENTATION_URL, SITE_URL } from "@/lib/site";

const ICONS: Record<string, LucideIcon> = {
  lock: Lock, plug: Plug, book: BookOpen, key: KeyRound, wrench: Wrench, flask: FlaskConical, activity: Activity,
  shield: ShieldCheck, eyeoff: EyeOff, network: Network, ban: Ban, chat: MessageCircle, file: FileText,
};

const btn = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-base font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]";
const btnPrimary = `${btn} bg-accent text-accent-ink hover:bg-accent-strong`;
const btnSecondary = `${btn} border border-line-strong text-fg hover:bg-surface-2`;

function Cta({ className = "" }: { className?: string }) {
  return (
    <a href={CTA_HREF} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} ${className}`}>
      <MessageCircle className="size-5" aria-hidden />
      {CTA_LABEL}
      <span className="sr-only"> (se abre WhatsApp en una pestaña nueva)</span>
    </a>
  );
}

function Section({ id, eyebrow, title, intro, children, tone = "bg-bg" }: { id: string; eyebrow: string; title: string; intro?: string; children: ReactNode; tone?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className={`${tone} py-16 sm:py-24`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-widest text-accent-strong">{eyebrow}</p>
          <h2 id={`${id}-t`} className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
          {intro && <p className="mt-4 max-w-2xl text-lg text-fg-2">{intro}</p>}
        </Reveal>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function Card({ icon, title, text, delay = 0 }: { icon: string; title: string; text: string; delay?: number }) {
  const Icon = ICONS[icon];
  return (
    <Reveal delay={delay} className="h-full">
      <article className="h-full rounded-2xl border border-line bg-surface p-6 transition-colors duration-300 hover:border-line-strong">
        <span className="inline-flex size-10 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
          <Icon className="size-5" aria-hidden />
        </span>
        <h3 className="mt-4 text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-base text-fg-2">{text}</p>
      </article>
    </Reveal>
  );
}

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "DEVMARK", url: "https://devmarkpe.com", email: EMAIL },
    { "@type": "WebSite", name: "DEVMARK AI", url: SITE_URL, inLanguage: "es" },
    {
      "@type": "SoftwareApplication",
      name: "DEVMARK AI",
      url: SITE_URL,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      description: "Plataforma privada de IA con API compatible con OpenAI, API keys por aplicación y conocimiento propio (RAG).",
      publisher: { "@type": "Organization", name: "DEVMARK" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
  ],
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:font-semibold focus:text-accent-ink">
        Saltar al contenido
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="#inicio" aria-label="DEVMARK AI, inicio"><Logo id="logo-header" /></a>
          <nav aria-label="Principal" className="flex items-center gap-6">
            <ul className="hidden items-center gap-6 text-sm font-medium text-fg-2 md:flex">
              <li><a className="hover:text-fg" href="#como-funciona">Cómo funciona</a></li>
              <li><a className="hover:text-fg" href="#capacidades">Capacidades</a></li>
              <li><a className="hover:text-fg" href="#seguridad">Seguridad</a></li>
              <li><a className="hover:text-fg" href="#preguntas">Preguntas</a></li>
            </ul>
            <a href={DASHBOARD_URL} className="text-sm font-medium text-fg-2 underline-offset-4 hover:text-fg hover:underline">Entrar al dashboard</a>
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* Portada */}
        <section id="inicio" aria-labelledby="inicio-t" className="hero-glow overflow-hidden pb-16 pt-12 sm:pb-24 sm:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex rounded-full border border-line-strong px-3 py-1 text-sm font-medium text-fg-2">Plataforma privada de IA</p>
              <h1 id="inicio-t" className="mt-6 max-w-[680px] text-5xl font-semibold tracking-tight sm:text-6xl">
                La IA de tu empresa, <span className="text-brand-gradient">privada y con tu conocimiento</span>
              </h1>
              <p className="mt-6 max-w-[680px] text-lg text-fg-2">
                DEVMARK AI es una API compatible con OpenAI que corre en servidores propios. Conecta tus aplicaciones cambiando solo la dirección base y haz que respondan con tus propios documentos.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Cta />
                <a href="#como-funciona" className={btnSecondary}>
                  Ver cómo funciona <ArrowRight className="size-5" aria-hidden />
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-fg-2">
                {["Compatible con los SDK de OpenAI", "Tus preguntas no salen a terceros", "Logs sin guardar prompts"].map((t) => (
                  <li key={t} className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-line-strong bg-surface" role="img" aria-label="Ejemplo de una petición a la API y su respuesta">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3" aria-hidden>
                <span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" /><span className="size-2.5 rounded-full bg-line-strong" />
                <span className="ml-2 font-mono text-xs text-fg-2">POST /v1/chat/completions</span>
              </div>
              <pre className="overflow-x-auto p-4 font-mono text-sm leading-6 text-fg sm:p-6" aria-hidden>
{`{
  "model": "llama3.2:1b",
  "messages": [
    { "role": "user",
      "content": "¿Cuál es el horario de atención?" }
  ]
}`}
              </pre>
              <div className="border-t border-line bg-bg-subtle p-4 sm:p-6" aria-hidden>
                <p className="font-mono text-xs uppercase tracking-widest text-accent-strong">Respuesta, con tus documentos</p>
                <pre className="mt-2 overflow-x-auto font-mono text-sm leading-6 text-fg-2">
{`{
  "choices": [{ "message": {
    "role": "assistant",
    "content": "…según el documento [1]…" } }],
  "rag": { "sources": [ … ] }
}`}
                </pre>
              </div>
            </div>
          </div>
        </section>

        {/* Qué es */}
        <Section id="que-es" eyebrow="Qué es" title="Una IA que es tuya, no de un tercero" intro="DEVMARK AI es la plataforma privada de IA de DEVMARK: un modelo propio, una API conocida y tus documentos como fuente de respuestas." tone="bg-bg-subtle">
          <div className="grid gap-4 md:grid-cols-3">
            {PILLARS.map((p, i) => <Card key={p.title} {...p} delay={i * 100} />)}
          </div>
        </Section>

        {/* Tagline */}
        <section aria-label="Resumen" className="bg-bg py-24 sm:py-32">
          <div className="mx-auto max-w-4xl px-4 sm:px-6"><Tagline text={TAGLINE} /></div>
        </section>

        {/* Cómo funciona */}
        <Section id="como-funciona" eyebrow="Cómo funciona" title="Tres pasos para conectarla" tone="bg-bg-subtle">
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <Reveal delay={i * 100} className="h-full">
                  <div className="h-full rounded-2xl border border-line bg-surface p-6">
                    <span className="inline-flex size-10 items-center justify-center rounded-full border border-accent/60 font-mono text-base font-semibold text-accent-strong" aria-hidden>{i + 1}</span>
                    <h3 className="mt-4 text-lg font-semibold"><span className="sr-only">Paso {i + 1}: </span>{s.title}</h3>
                    <p className="mt-2 text-base text-fg-2">{s.text}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </Section>

        {/* Capacidades */}
        <Section id="capacidades" eyebrow="Qué incluye" title="Todo para integrar IA en tus aplicaciones">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => <Card key={f.title} {...f} delay={(i % 3) * 100} />)}
          </div>
        </Section>

        {/* Código */}
        <Section id="codigo" eyebrow="Para desarrolladores" title="Conéctala en minutos" intro="Compatible con los SDK de OpenAI: solo cambia la dirección base. La key va únicamente en el backend de cada aplicación." tone="bg-bg-subtle">
          <Reveal>
            <CodeTabs tabs={[{ name: "cURL", code: CURL }, { name: "JavaScript", code: JS }, { name: "Python", code: PY }]} />
            <p className="mt-4 text-sm text-fg-2">Dirección base: <code className="font-mono text-fg">{API_BASE_URL}</code></p>
          </Reveal>
        </Section>

        {/* Seguridad */}
        <Section id="seguridad" eyebrow="Seguridad" title="Privada de verdad">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map((s, i) => <Card key={s.title} {...s} delay={(i % 3) * 100} />)}
          </div>
        </Section>

        {/* Casos de uso */}
        <Section id="casos" eyebrow="Ejemplos de uso" title="Qué puedes construir" intro="Ejemplos ilustrativos de lo que permite la plataforma, no casos de clientes." tone="bg-bg-subtle">
          <div className="grid gap-4 md:grid-cols-3">
            {USE_CASES.map((u, i) => <Card key={u.title} {...u} delay={i * 100} />)}
          </div>
          <Reveal className="mt-8">
            <a href={PRESENTATION_URL} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
              Ver la presentación interactiva <ExternalLink className="size-5" aria-hidden />
              <span className="sr-only"> (se abre en una pestaña nueva)</span>
            </a>
          </Reveal>
        </Section>

        {/* Preguntas */}
        <Section id="preguntas" eyebrow="Preguntas frecuentes" title="Lo que suelen preguntar">
          <Reveal>
            <div className="max-w-3xl divide-y divide-line rounded-2xl border border-line bg-surface">
              {FAQ.map((f) => (
                <details key={f.q} className="group px-4 sm:px-6">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-base font-semibold">
                    {f.q}
                    <ChevronDown className="chev size-5 shrink-0 text-fg-2" aria-hidden />
                  </summary>
                  <p className="pb-4 text-base text-fg-2">{f.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </Section>

        {/* Cierre */}
        <section id="contacto" aria-labelledby="contacto-t" className="bg-bg-subtle py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <Reveal>
              <h2 id="contacto-t" className="text-4xl font-semibold tracking-tight sm:text-5xl">Cuéntanos qué quieres que tu IA sepa hacer</h2>
              <p className="mx-auto mt-4 max-w-xl text-lg text-fg-2">Un asesor de DEVMARK revisa tu caso y te dice cómo conectarla a tu aplicación.</p>
              <div className="mt-8 flex justify-center"><Cta /></div>
              <p className="mt-4 text-sm text-fg-2">{HOURS}</p>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-bg py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo id="logo-footer" />
            <p className="mt-3 text-sm text-fg-2">© {new Date().getFullYear()} DEVMARK. Todos los derechos reservados.</p>
          </div>
          <nav aria-label="Enlaces" className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-fg-2">
            <a className="hover:text-fg" href={DASHBOARD_URL}>Entrar al dashboard</a>
            <a className="hover:text-fg" href={LLMS_URL}>Guía para agentes (llms.txt)</a>
            <a className="hover:text-fg" href={PRESENTATION_URL} target="_blank" rel="noopener noreferrer">Presentación</a>
            <a className="hover:text-fg" href={`mailto:${EMAIL}`}>{EMAIL}</a>
          </nav>
        </div>
      </footer>
    </>
  );
}
