"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { GlobalSearch } from "@/components/layout/GlobalSearch";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/admin/login";

  if (isLogin) {
    return <div className="admin-shell">{children}</div>;
  }

  return (
    <div className="admin-shell flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 pt-20 sm:p-6 sm:pt-20 lg:p-8 lg:pt-8">
        <GlobalSearch />
        {children}
      </main>
    </div>
  );
}
