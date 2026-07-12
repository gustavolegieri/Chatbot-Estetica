"use client";

import { useEffect, useState } from "react";

interface Metrics {
  averageTicket: { value: number; formatted: string };
  totalRevenue: { value: number; formatted: string };
  totalAppointments: number;
  uniqueClients: number;
  topServices: Array<{ serviceName: string; count: number; price: number }>;
}

export default function PainelTestePage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    fetchMetrics();
  }, [startDate, endDate]);

  const fetchMetrics = async () => {
    try {
      const params = new URLSearchParams();
      if (startDate) params.append("startDate", startDate);
      if (endDate) params.append("endDate", endDate);

      const response = await fetch(`/api/painel-teste/metricas?${params.toString()}`);
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error("Error fetching metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Carregando...</div>;
  }

  if (!metrics) {
    return <div className="p-8">Erro ao carregar métricas</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Painel Teste - Métricas</h1>

      {/* Date Filter */}
      <div className="mb-6 p-4 bg-white rounded-lg shadow">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Data Início</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Data Fim</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded px-3 py-2"
            />
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Ticket Médio</h3>
          <p className="text-2xl font-bold mt-2">{metrics.averageTicket.formatted}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Faturamento Total</h3>
          <p className="text-2xl font-bold mt-2">{metrics.totalRevenue.formatted}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Agendamentos</h3>
          <p className="text-2xl font-bold mt-2">{metrics.totalAppointments}</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-gray-500 text-sm font-medium">Clientes Únicos</h3>
          <p className="text-2xl font-bold mt-2">{metrics.uniqueClients}</p>
        </div>
      </div>

      {/* Top Services */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Top Serviços</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2">Serviço</th>
              <th className="text-right py-2">Quantidade</th>
              <th className="text-right py-2">Preço</th>
            </tr>
          </thead>
          <tbody>
            {metrics.topServices.map((service, index) => (
              <tr key={index} className="border-b">
                <td className="py-2">{service.serviceName}</td>
                <td className="text-right py-2">{service.count}</td>
                <td className="text-right py-2">
                  R$ {Number(service.price).toFixed(2).replace('.', ',')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
