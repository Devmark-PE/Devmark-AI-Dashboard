import { Activity, AppWindow, BarChart3, BookOpen, Boxes, KeyRound, LayoutDashboard, ScrollText, Settings } from "lucide-react";

export const NAV = [
  {
    section: "Plataforma",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/api-keys/", label: "API Keys", icon: KeyRound },
      { href: "/applications/", label: "Aplicaciones", icon: AppWindow },
      { href: "/models/", label: "Modelos", icon: Boxes },
    ],
  },
  {
    section: "Observabilidad",
    items: [
      { href: "/usage/", label: "Uso", icon: BarChart3 },
      { href: "/logs/", label: "Logs", icon: ScrollText },
      { href: "/system/", label: "Sistema", icon: Activity },
    ],
  },
  {
    section: "Recursos",
    items: [
      { href: "/docs/", label: "Documentación", icon: BookOpen },
      { href: "/settings/", label: "Configuración", icon: Settings },
    ],
  },
] as const;
