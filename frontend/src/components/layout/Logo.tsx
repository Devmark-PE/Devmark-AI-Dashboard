"use client";

import { useId } from "react";

export function LogoMark({ className = "size-7" }: { className?: string }) {
  // Id único: puede haber varios logos en la página (sidebar oculto + topbar).
  const gradient = `dmk-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a397ff" />
          <stop offset="1" stopColor="#3987e5" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#0b0a1a" stroke={`url(#${gradient})`} strokeOpacity="0.55" />
      <path d="M10 9.5h6.2c4.1 0 6.8 2.6 6.8 6.5s-2.7 6.5-6.8 6.5H10z" fill="none" stroke={`url(#${gradient})`} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="16.2" cy="16" r="2.1" fill="#a397ff" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-none">
        <span className="text-[15px] font-semibold tracking-tight text-fg">
          DEV<span className="text-fg-2">mark</span>
        </span>
        <span className="ml-1.5 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-accent-strong">AI</span>
      </div>
    </div>
  );
}
