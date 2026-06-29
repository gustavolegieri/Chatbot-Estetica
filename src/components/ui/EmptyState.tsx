import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="rounded-full bg-brand-900/30 p-4 ring-1 ring-brand-700/20">
        <Icon className="h-8 w-8 text-brand-400" />
      </div>
      <h3 className="mt-4 font-serif text-lg font-medium text-brand-200">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
