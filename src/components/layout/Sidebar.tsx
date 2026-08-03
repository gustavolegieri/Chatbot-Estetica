"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarOff,
  ChevronDown,
  Columns3,
  DollarSign,
  Download,
  Gift,
  Headphones,
  Image as ImageIcon,
  Layers,
  LogOut,
  Menu,
  MessageSquare,
  QrCode,
  SearchCheck,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Smartphone,
  TestTube,
  Users,
  Wrench,
  Workflow,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  badge?: boolean;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ href: "/admin/dashboard", label: "Dashboard", icon: BarChart3 }],
  },
  {
    label: "Relacionamento",
    items: [
      { href: "/admin/atendimento", label: "Central de atendimento", icon: Headphones, badge: true },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/pipeline", label: "Pipeline CRM", icon: Columns3 },
      { href: "/admin/agendamentos", label: "Agenda", icon: Calendar },
      { href: "/admin/mobile", label: "Aplicativo mobile", icon: Smartphone },
    ],
  },
  {
    label: "Negócio",
    items: [
      { href: "/admin/servicos", label: "Serviços", icon: Wrench },
      { href: "/admin/campanhas", label: "Campanhas", icon: Send },
      { href: "/admin/fidelidade", label: "Fidelidade e cupons", icon: Gift },
      { href: "/admin/financeiro", label: "Financeiro", icon: DollarSign },
      { href: "/admin/pagamentos", label: "Pagamentos", icon: QrCode },
      { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
    ],
  },
  {
    label: "WhatsApp e IA",
    items: [
      { href: "/admin/fluxo", label: "Fluxo WhatsApp", icon: Workflow },
      { href: "/admin/bot/prompts", label: "Inteligência do bot", icon: Sparkles },
      { href: "/admin/notificacoes", label: "Notificações", icon: Bell },
    ],
  },
  {
    label: "Operação",
    items: [
      { href: "/admin/midia", label: "Galeria e mídia", icon: ImageIcon },
      { href: "/admin/horarios", label: "Horários", icon: Calendar },
      { href: "/admin/feriados", label: "Datas bloqueadas", icon: CalendarOff },
      { href: "/admin/bloqueio", label: "Contatos bloqueados", icon: MessageSquare },
      { href: "/admin/marca", label: "Marca e identidade", icon: ImageIcon },
      { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
      { href: "/admin/sistema", label: "Sistema", icon: Layers },
    ],
  },
  {
    label: "Administração",
    items: [
      { href: "/admin/usuarios", label: "Usuários e acessos", icon: ShieldCheck, adminOnly: true },
      { href: "/admin/auditoria", label: "Auditoria", icon: SearchCheck },
      { href: "/admin/backup", label: "Backup", icon: Download },
    ],
  },
];

const labItems: NavItem[] = [
  { href: "/admin/teste", label: "Teste do bot", icon: TestTube },
  { href: "/admin/teste/avaliacao", label: "Avaliação do bot", icon: Star },
  { href: "/admin/teste-fluxo", label: "Teste de fluxo", icon: TestTube },
  { href: "/admin/test-webhook", label: "Testar webhook", icon: Send },
  { href: "/admin/testar-envio", label: "Testar envio", icon: Send },
  { href: "/admin/diagnostico-whatsapp", label: "Diagnóstico WhatsApp", icon: Wrench },
  { href: "/admin/painel-teste", label: "Painel de teste", icon: BarChart3 },
];

function isCurrentRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const [handoffCount, setHandoffCount] = useState(0);
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [labOpen, setLabOpen] = useState(() => labItems.some((item) => isCurrentRoute(pathname, item.href)));

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
    const interval = setInterval(loadBadge, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.role) {
          setUser({ name: data.data.name ?? "Equipe", role: data.data.role });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    if (labItems.some((item) => isCurrentRoute(pathname, item.href))) setLabOpen(true);
  }, [pathname]);

  const visibleGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.adminOnly || user?.role === "ADMIN"),
        }))
        .filter((group) => group.items.length > 0),
    [user?.role]
  );

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/admin/login";
  }

  function renderNavItem(item: NavItem, nested = false) {
    const Icon = item.icon;
    const active = isCurrentRoute(pathname, item.href);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-all duration-200",
          nested && "ml-2 py-1.5 text-[13px]",
          active
            ? "bg-gradient-to-r from-brand-700/45 to-brand-900/20 font-semibold text-brand-100 ring-1 ring-inset ring-brand-500/30 shadow-[0_8px_24px_rgba(212,175,55,0.08)]"
            : "font-medium text-slate-400 hover:bg-white/[0.045] hover:text-slate-100"
        )}
      >
        {active && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-brand-300" />}
        <Icon
          className={cn(
            "h-[18px] w-[18px] shrink-0 transition-colors",
            nested && "h-4 w-4",
            active ? "text-brand-300" : "text-slate-500 group-hover:text-brand-300"
          )}
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge && handoffCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(239,68,68,0.38)]">
            {handoffCount > 99 ? "99+" : handoffCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-600/30 bg-surface-850 text-brand-200 shadow-xl lg:hidden"
        aria-label="Abrir navegação"
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Fechar navegação"
          className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col overflow-hidden border-r border-brand-900/50 bg-[#0b0b0c] shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="relative shrink-0 border-b border-white/[0.06] px-5 py-5">
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-brand-500/50 to-transparent" />
          <div className="flex items-center justify-between gap-3">
            <BrandLogo size="md" showText />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-slate-200 lg:hidden"
              aria-label="Fechar navegação"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.65)]" />
            Central operacional
          </div>
        </div>

        <nav className="sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {visibleGroups.map((group, index) => (
            <section key={group.label} className={cn(index > 0 && "mt-5")}>
              <p className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600">
                {group.label}
              </p>
              <div className="space-y-0.5">{group.items.map((item) => renderNavItem(item))}</div>
            </section>
          ))}

          <section className="mt-5 border-t border-white/[0.055] pt-4">
            <button
              type="button"
              onClick={() => setLabOpen((open) => !open)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
                labOpen ? "bg-white/[0.035] text-slate-200" : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-300"
              )}
              aria-expanded={labOpen}
            >
              <TestTube className="h-[18px] w-[18px]" />
              <span className="flex-1">Laboratório</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", labOpen && "rotate-180")} />
            </button>
            {labOpen && <div className="mt-1 space-y-0.5">{labItems.map((item) => renderNavItem(item, true))}</div>}
          </section>
        </nav>

        <div className="shrink-0 border-t border-white/[0.06] bg-black/20 p-3">
          <PwaInstallButton compact className="mb-2" />
          <div className="mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-900/50 text-xs font-bold text-brand-200 ring-1 ring-brand-700/30">
              {user?.name?.slice(0, 1).toUpperCase() ?? "G"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-200">{user?.name ?? "Equipe Garagem"}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                {user?.role === "ADMIN" ? "Administrador" : "Atendimento"}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Encerrar sessão
          </button>
        </div>
      </aside>
    </>
  );
}
