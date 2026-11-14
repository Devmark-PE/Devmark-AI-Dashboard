/** Isotipo y nombre de la marca (mismo dibujo que frontend/src/components/layout/Logo.tsx). `id` evita ids repetidos en el SVG. */
export function Logo({ id, className = "text-base" }: { id: string; className?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5 leading-none">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a397ff" />
            <stop offset="1" stopColor="#3987e5" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="8" fill="#0b0a1a" stroke={`url(#${id})`} strokeOpacity="0.55" />
        <path d="M10 9.5h6.2c4.1 0 6.8 2.6 6.8 6.5s-2.7 6.5-6.8 6.5H10z" fill="none" stroke={`url(#${id})`} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="16.2" cy="16" r="2.1" fill="#a397ff" />
      </svg>
      <span className={`font-brand tracking-[0.06em] text-fg ${className}`}>
        DEV<span className="text-fg-2">MARK</span>
      </span>
      <span className="rounded-md bg-accent-soft px-1.5 py-1 text-xs font-semibold tracking-wider text-accent-strong">AI</span>
    </span>
  );
}
