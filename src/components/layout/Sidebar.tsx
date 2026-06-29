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
  Car,
  LogOut,
  MessageSquare,
  CalendarOff,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
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

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-5">
        <div className="rounded-lg bg-brand-600 p-2">
          <Car className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900">Estética Auto</h1>
          <p className="text-xs text-slate-500">Painel Admin</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
              {"badge" in item && item.badge && handoffCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {handoffCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </aside>
  );
}
