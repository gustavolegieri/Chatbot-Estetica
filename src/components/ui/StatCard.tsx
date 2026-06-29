import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  className?: string;
}

export function StatCard({ title, value, icon: Icon, trend, className }: StatCardProps) {
  return (
    <div className={cn("card flex items-start justify-between", className)}>
      <div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        <p className="mt-2 font-serif text-2xl font-bold text-brand-200">{value}</p>
        {trend && <p className="mt-1 text-xs text-slate-500">{trend}</p>}
      </div>
      <div className="rounded-lg bg-brand-900/30 p-3 ring-1 ring-brand-700/20">
        <Icon className="h-6 w-6 text-brand-400" />
      </div>
    </div>
  );
}
