"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
import { AdminWorkspaceTabs } from "@/components/layout/AdminWorkspaceTabs";
import { PwaInstallButton } from "@/components/pwa/PwaInstallButton";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";
  const isMobileApp = pathname.startsWith("/admin/mobile");

  if (isLogin) {
    return <div className="admin-shell">{children}</div>;
  }

  if (isMobileApp) return <div className="min-h-dvh bg-[#07110d] text-slate-100">{children}</div>;

  return (
    <div className="admin-shell flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
        <GlobalSearch />
        <AdminWorkspaceTabs />
        {children}
      </main>
      <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 rounded-2xl border border-brand-500/20 bg-[#0b1712]/95 p-2.5 shadow-2xl shadow-black/50 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <Link href="/admin/mobile" className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 py-2.5 text-xs font-semibold text-slate-100">
            <Smartphone className="h-4 w-4 shrink-0 text-brand-300" />
            <span className="truncate">Abrir central mobile</span>
          </Link>
          <PwaInstallButton className="shrink-0 px-3 py-2.5 text-xs" />
        </div>
      </div>
    </div>
  );
}
