"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  CalendarDays,
  Columns3,
  Gauge,
  LayoutDashboard,
  Lightbulb,
  Megaphone,
  MessageCircleMore,
  RotateCcw,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs: Array<{ href: string; label: string; icon: LucideIcon; health?: boolean }> = [
  { href: "/admin/dashboard", label: "Hoje", icon: LayoutDashboard },
  { href: "/admin/operacao", label: "Ação", icon: Gauge },
  { href: "/admin/atendimento", label: "Conversas", icon: MessageCircleMore },
  { href: "/admin/agendamentos", label: "Agenda", icon: CalendarDays },
  { href: "/admin/pipeline", label: "CRM", icon: Columns3 },
  { href: "/admin/insights", label: "Insights", icon: Lightbulb },
  { href: "/admin/retencao", label: "Retenção", icon: RotateCcw },
  { href: "/admin/clientes", label: "Clientes", icon: UsersRound },
  { href: "/admin/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/admin/whatsapp", label: "WhatsApp & IA", icon: Bot, health: true },
];

type HealthStatus = "healthy" | "warning" | "critical" | null;

export function AdminWorkspaceTabs() {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthStatus>(null);

  useEffect(() => {
    let active = true;
    const receiveHealth = (event: Event) => {
      const status = (event as CustomEvent<HealthStatus>).detail;
      if (active) setHealth(status);
    };
    const load = () => {
      fetch("/api/admin/whatsapp-health")
        .then((response) => response.json())
        .then((payload) => {
          if (active && payload.success) setHealth(payload.data.status);
        })
        .catch(() => {
          if (active) setHealth("critical");
        });
    };
    window.addEventListener("whatsapp-health", receiveHealth);
    const centralOwnsHealth = pathname.startsWith("/admin/whatsapp");
    const commandCenterIsLoading = ["/admin/operacao", "/admin/insights", "/admin/retencao"].some((path) => pathname.startsWith(path));
    const currentPageOwnsHealth = centralOwnsHealth || commandCenterIsLoading;
    if (!currentPageOwnsHealth) load();
    const timer = currentPageOwnsHealth ? null : window.setInterval(load, 30_000);
    return () => {
      active = false;
      window.removeEventListener("whatsapp-health", receiveHealth);
      if (timer) window.clearInterval(timer);
    };
  }, [pathname]);

  return (
    <nav
      aria-label="Áreas principais do CRM"
      className="mb-5 overflow-x-auto rounded-2xl border border-white/[0.065] bg-surface-850/60 p-1.5 shadow-[0_12px_34px_rgba(0,0,0,0.14)] backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max items-center gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition sm:text-sm",
                selected
                  ? "bg-brand-500/15 text-brand-100 ring-1 ring-inset ring-brand-400/25 shadow-[0_8px_24px_rgba(212,175,55,0.08)]"
                  : "text-slate-500 hover:bg-white/[0.045] hover:text-slate-200"
              )}
            >
              <Icon className={cn("h-4 w-4", selected ? "text-brand-300" : "text-slate-600")} />
              {tab.label}
              {tab.health && (
                <span
                  aria-label={health === "healthy" ? "Operacional" : health === "warning" ? "Atenção" : health === "critical" ? "Indisponível" : "Verificando"}
                  className={cn(
                    "ml-0.5 h-2 w-2 rounded-full",
                    health === "healthy" && "bg-emerald-400 shadow-[0_0_9px_rgba(52,211,153,0.8)]",
                    health === "warning" && "bg-amber-400 shadow-[0_0_9px_rgba(251,191,36,0.75)]",
                    health === "critical" && "bg-red-400 shadow-[0_0_9px_rgba(248,113,113,0.75)]",
                    health === null && "bg-slate-700"
                  )}
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
