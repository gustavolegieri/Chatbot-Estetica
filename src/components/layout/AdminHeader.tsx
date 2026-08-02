import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  icon?: LucideIcon;
  className?: string;
}

export function AdminHeader({
  title,
  description,
  actions,
  eyebrow = "Painel administrativo",
  icon: Icon,
  className,
}: AdminHeaderProps) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/[0.075] bg-surface-850/85 px-5 py-5 shadow-[0_16px_48px_rgba(0,0,0,0.18)] sm:px-6",
        className
      )}
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-52 w-52 rounded-full bg-brand-500/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 left-6 h-px w-32 bg-gradient-to-r from-brand-300/75 to-transparent" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-400/85">
            {Icon ? <Icon className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
            {eyebrow}
          </div>
          <h1 className="heading-brand text-2xl font-bold leading-tight text-brand-100 sm:text-[28px]">{title}</h1>
          {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
