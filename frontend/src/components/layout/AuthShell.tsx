import { BookOpen, KeyRound, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import { LogoMark, Wordmark } from "./Logo";

const FEATURES = [
  { icon: KeyRound, title: "API compatible con OpenAI", text: "Keys por aplicación, hash seguro y revocación inmediata." },
  { icon: BookOpen, title: "Conocimiento propio (RAG)", text: "Tus documentos responden por tu equipo y tus clientes." },
  { icon: Lock, title: "Privada de verdad", text: "Tu modelo corre en tu servidor. Tus datos no salen de tu infraestructura." },
];

/** Pantalla dividida: marca a la izquierda (escritorio), formulario a la derecha. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line bg-bg-subtle lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(40rem 26rem at 10% 0%, rgba(139,124,255,.22), transparent 60%), radial-gradient(34rem 24rem at 100% 100%, rgba(57,135,229,.16), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)", backgroundSize: "48px 48px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }}
        />
        <div className="relative flex items-center gap-3">
          <LogoMark className="size-9" />
          <Wordmark className="text-xl" />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-4xl leading-tight font-semibold tracking-tight text-fg">
            Tu plataforma privada <span className="bg-gradient-to-r from-[#a397ff] to-[#3987e5] bg-clip-text whitespace-nowrap text-transparent">de IA</span>
          </h1>
          <p className="mt-4 text-[15px] text-fg-2">Modelos, API keys, conocimiento y uso de toda la empresa en un solo lugar.</p>
          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line-strong bg-surface/70 text-accent-strong">
                  <Icon className="size-4" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-fg">{title}</span>
                  <span className="block text-[13px] text-fg-3">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative flex items-center gap-2 text-xs text-fg-3">
          <ShieldCheck className="size-3.5" /> Acceso protegido · HTTPS · verificación en dos pasos
        </p>
      </aside>
      <main className="brand-glow flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <LogoMark className="size-8" />
            <Wordmark className="text-lg" />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold tracking-tight text-fg">{title}</h2>
      {description && <p className="mt-1.5 text-sm text-fg-2">{description}</p>}
    </div>
  );
}
