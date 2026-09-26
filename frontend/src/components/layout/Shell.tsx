"use client";

import { LogOut, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { AI_POWER_EVENT } from "@/components/AiPowerCard";
import { cx } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useResource } from "@/lib/hooks";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

import { Logo } from "./Logo";
import { NAV } from "./nav";

function isActive(pathname: string, href: string) {
  const clean = pathname.replace(/\/$/, "") || "/";
  const target = href.replace(/\/$/, "") || "/";
  return target === "/" ? clean === "/" : clean.startsWith(target);
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data, reload } = useResource<{ ollama_status: string; default_model: string; ai_paused: boolean }>("/overview", 60_000);
  useEffect(() => {
    window.addEventListener(AI_POWER_EVENT, reload);
    return () => window.removeEventListener(AI_POWER_EVENT, reload);
  }, [reload]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-5">
        <Logo />
      </div>
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Principal">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 px-2.5 text-[11px] font-medium tracking-wider text-fg-3 uppercase">{group.section}</p>
            <ul className="space-y-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
                        active ? "bg-surface-3 text-fg" : "text-fg-2 hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      <Icon className={cx("size-4", active ? "text-accent-strong" : "text-fg-3 group-hover:text-fg-2")} aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 rounded-xl border border-line bg-surface-2/60 p-3">
        <p className="text-[11px] font-medium tracking-wider text-fg-3 uppercase">Modelo por defecto</p>
        <p className="mt-1 truncate font-mono text-[13px] text-fg">{data?.default_model ?? "—"}</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-3">
          <span className={cx("size-1.5 rounded-full", data?.ai_paused ? "bg-warning" : data?.ollama_status === "online" ? "bg-good" : data ? "bg-critical" : "bg-fg-3")} />
          {data ? (data.ai_paused ? "IA en pausa (reposo)" : data.ollama_status === "online" ? "Ollama conectado" : "Ollama no responde") : "Comprobando…"}
        </p>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [theme, set] = useState<Theme>("dark");
  useEffect(() => set(getTheme()), []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next);
        set(next);
      }}
      className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg"
      aria-label={next === "light" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMobileOpen(false), [pathname]);

  const initials = (me?.user.name || me?.user.email || "?")
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-bg-subtle lg:block">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-64 border-r border-line bg-bg-subtle">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute top-3.5 right-3 rounded-md p-1.5 text-fg-3 hover:text-fg" aria-label="Cerrar menú">
              <X className="size-4" />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="brand-glow min-h-dvh lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-md p-1.5 text-fg-2 hover:bg-surface-2 lg:hidden" aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden items-center gap-2 text-[13px] text-fg-3 lg:flex">
            <span className="font-mono">ai.devmarkpe.com</span>
            <span className="rounded-md border border-line px-1.5 py-0.5 text-[11px]">producción</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <div className="mx-1 hidden h-5 w-px bg-line sm:block" />
            <div className="hidden text-right sm:block">
              <p className="text-[13px] leading-tight font-medium text-fg">{me?.user.name || "Administrador"}</p>
              <p className="text-[11px] leading-tight text-fg-3">{me?.user.email}</p>
            </div>
            <div className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-strong">{initials}</div>
            <button type="button" onClick={() => void logout()} className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-surface-2 hover:text-fg" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
