import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  PENDING: "bg-yellow-900/50 text-yellow-300 ring-yellow-700/40",
  CONFIRMED: "bg-blue-900/50 text-blue-300 ring-blue-700/40",
  IN_PROGRESS: "bg-purple-900/50 text-purple-300 ring-purple-700/40",
  COMPLETED: "bg-green-900/50 text-green-300 ring-green-700/40",
  CANCELLED: "bg-red-900/50 text-red-300 ring-red-700/40",
  NO_SHOW: "bg-surface-700 text-slate-400 ring-surface-600",
  INCOME: "bg-green-900/50 text-green-300 ring-green-700/40",
  EXPENSE: "bg-red-900/50 text-red-300 ring-red-700/40",
};

const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  IN_PROGRESS: "Em andamento",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
  NO_SHOW: "Não compareceu",
  INCOME: "Receita",
  EXPENSE: "Despesa",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        statusStyles[status] ?? "bg-surface-700 text-slate-300 ring-surface-600"
      )}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}
