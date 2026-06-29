"use client";

import { useEffect, useState } from "react";
import { Users, Calendar, DollarSign, Clock, MessageCircle, Wrench } from "lucide-react";
import { AdminHeader } from "@/components/layout/AdminHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/utils";

interface DashboardData {
  totalClients: number;
  totalAppointments: number;
  todayAppointments: number;
  pendingAppointments: number;
  monthRevenue: number;
  monthExpenses: number;
  whatsappSessions: number;
  whatsappAppointments: number;
  blockedDatesCount: number;
  activeServices: number;
  recentAppointments: Array<{
    id: string;
    date: string;
    startTime: string;
    status: string;
    client: { name: string };
    service: { name: string };
  }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((res) => {
        if (res.success) setData(res.data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-500">Carregando...</div>;
  }

  const profit = (data?.monthRevenue ?? 0) - (data?.monthExpenses ?? 0);

  return (
    <div>
      <AdminHeader title="Dashboard" description="Visão geral do seu negócio e do bot WhatsApp" />

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Clientes" value={data?.totalClients ?? 0} icon={Users} />
        <StatCard title="Agendamentos hoje" value={data?.todayAppointments ?? 0} icon={Calendar} />
        <StatCard title="Pendentes" value={data?.pendingAppointments ?? 0} icon={Clock} />
        <StatCard
          title="Receita do mês"
          value={formatCurrency(data?.monthRevenue ?? 0)}
          icon={DollarSign}
          trend={`Lucro: ${formatCurrency(profit)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Sessões WhatsApp (7d)" value={data?.whatsappSessions ?? 0} icon={MessageCircle} />
        <StatCard title="Agendamentos via bot" value={data?.whatsappAppointments ?? 0} icon={MessageCircle} />
        <StatCard title="Serviços no bot" value={data?.activeServices ?? 0} icon={Wrench} />
        <StatCard title="Bloqueios futuros" value={data?.blockedDatesCount ?? 0} icon={Calendar} />
      </div>

      <div className="mt-8 card">
        <h2 className="mb-4 text-lg font-semibold">Próximos agendamentos</h2>
        {data?.recentAppointments?.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum agendamento próximo</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-3 font-medium">Cliente</th>
                  <th className="pb-3 font-medium">Serviço</th>
                  <th className="pb-3 font-medium">Data</th>
                  <th className="pb-3 font-medium">Horário</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data?.recentAppointments?.map((apt) => (
                  <tr key={apt.id} className="border-b border-slate-100">
                    <td className="py-3 font-medium">{apt.client.name}</td>
                    <td className="py-3">{apt.service.name}</td>
                    <td className="py-3">{formatDate(apt.date)}</td>
                    <td className="py-3">{apt.startTime}</td>
                    <td className="py-3">
                      <StatusBadge status={apt.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
