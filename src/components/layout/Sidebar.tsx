"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Wrench,
  Calendar,
  DollarSign,
  Settings,
  Bell,
  LogOut,
  MessageSquare,
  CalendarOff,
  Headphones,
  Layers,
  Image as ImageIcon,
  Download,
  BarChart2,
  Send,
  Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/sistema", label: "Sistema", icon: Layers },
  { href: "/admin/marca", label: "Marca", icon: ImageIcon },
  { href: "/admin/usuarios", label: "Usuários", icon: Users, adminOnly: true },
  { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
  { href: "/admin/campanhas", label: "Campanhas", icon: Send },
  { href: "/admin/midia", label: "Galeria/Mídia", icon: ImageIcon },
  { href: "/admin/fidelidade", label: "Fidelidade / Cupons", icon: Gift },
  { href: "/admin/auditoria", label: "Log de Auditoria", icon: LogOut },
  { href: "/admin/backup", label: "Backup", icon: Download },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart2 },
  { href: "/admin/atendimento", label: "Atendimento", icon: Headphones, badge: true },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/servicos", label: "Serviços", icon: Wrench },
  { href: "/admin/agendamentos", label: "Agendamentos", icon: Calendar },
  { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
  { href: "/admin/bot/prompts", label: "Prompts Bot", icon: MessageSquare },
  { href: "/admin/feriados", label: "Feriados", icon: CalendarOff },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [handoffCount, setHandoffCount] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    function loadBadge() {
      fetch("/api/atendimento/badge")
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setHandoffCount(res.data.pendingHandoffs);
        })
        .catch(() => {});
    }
    loadBadge();
    const interval = setInterval(loadBadge, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.role) {
          setUserRole(data.data.role);
        }
      })
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-brand-900/40 bg-surface-900">
      <div className="border-b border-brand-900/40 px-4 py-5">
        <BrandLogo size="md" showText />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
        {navItems
          .filter((item) => !item.adminOnly || userRole === "ADMIN")
          .map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-brand-900/40 text-brand-300 shadow-gold ring-1 ring-brand-700/30"
                    : "text-slate-400 hover:bg-surface-800 hover:text-brand-200"
                )}
              >
                <Icon className={cn("h-5 w-5", active ? "text-brand-400" : "")} />
                {item.label}
                {"badge" in item && item.badge && handoffCount > 0 && (
                  <span className="ml-auto flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white shadow-lg shadow-red-900/50">
                    {handoffCount}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>

      <div className="border-t border-brand-900/40 p-3">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-950/40 hover:text-red-400"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
