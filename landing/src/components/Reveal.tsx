"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Aparición suave al entrar en pantalla (IntersectionObserver, sin listeners de scroll). */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}

/** Frase grande cuyas palabras se iluminan una a una al pasar por la mitad inferior de la pantalla. */
export function Tagline({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const words = ref.current?.querySelectorAll<HTMLElement>(".word");
    if (!words?.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("on");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -35% 0px" },
    );
    words.forEach((w) => io.observe(w));
    return () => io.disconnect();
  }, []);
  return (
    <p ref={ref} className="tagline text-4xl font-semibold tracking-tight sm:text-5xl">
      {text.split(" ").map((w, i) => (
        <span key={i} className="word">{w} </span>
      ))}
    </p>
  );
}
