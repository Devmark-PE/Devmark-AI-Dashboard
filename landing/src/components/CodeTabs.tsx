"use client";

import { useRef, useState } from "react";

export type CodeTab = { name: string; code: string };

/** Pestañas accesibles (roles ARIA y flechas del teclado) para los ejemplos de código. */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line-strong bg-surface">
      <div role="tablist" aria-label="Lenguaje del ejemplo" className="flex gap-1 border-b border-line bg-bg-subtle p-2" onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.name}
            ref={(el) => { buttons.current[i] = el; }}
            role="tab"
            id={`tab-${i}`}
            aria-selected={active === i}
            aria-controls={`panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-300 ${active === i ? "bg-accent-soft text-accent-strong" : "text-fg-2 hover:text-fg"}`}
          >
            {t.name}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.name} role="tabpanel" id={`panel-${i}`} aria-labelledby={`tab-${i}`} hidden={active !== i} tabIndex={0}>
          <pre className="overflow-x-auto p-4 font-mono text-sm leading-6 text-fg sm:p-6"><code>{t.code}</code></pre>
        </div>
      ))}
    </div>
  );
}
