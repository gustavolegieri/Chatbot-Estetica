"use client";

import { useEffect, useState } from "react";

interface BusinessHour {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

const DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

export default function HorariosPage() {
  const [businessHours, setBusinessHours] = useState<BusinessHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetchBusinessHours();
  }, []);

  const fetchBusinessHours = async () => {
    try {
      const res = await fetch("/api/business-hours");
      const data = await res.json();
      setBusinessHours(data);
    } catch (error) {
      console.error("Error fetching business hours:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleOpen = async (id: string, isOpen: boolean) => {
    try {
      await fetch(`/api/business-hours/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isOpen }),
      });
      fetchBusinessHours();
    } catch (error) {
      console.error("Error updating:", error);
    }
  };

  const handleUpdateTime = async (id: string, field: "openTime" | "closeTime", value: string) => {
    try {
      await fetch(`/api/business-hours/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      fetchBusinessHours();
    } catch (error) {
      console.error("Error updating:", error);
    }
  };

  const handleCreate = async (dayOfWeek: number) => {
    try {
      await fetch("/api/business-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dayOfWeek,
          openTime: "08:00",
          closeTime: "18:00",
          isOpen: true,
        }),
      });
      fetchBusinessHours();
    } catch (error) {
      console.error("Error creating:", error);
    }
  };

  const getDayLabel = (dayOfWeek: number) => {
    return DAYS.find(d => d.value === dayOfWeek)?.label || `Dia ${dayOfWeek}`;
  };

  if (loading) {
    return <div className="p-8">Carregando...</div>;
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Horários de Funcionamento</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left py-3 px-4">Dia</th>
              <th className="text-left py-3 px-4">Abertura</th>
              <th className="text-left py-3 px-4">Fechamento</th>
              <th className="text-left py-3 px-4">Status</th>
              <th className="text-left py-3 px-4">Ações</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => {
              const hour = businessHours.find(h => h.dayOfWeek === day.value);
              return (
                <tr key={day.value} className="border-b">
                  <td className="py-3 px-4 font-medium">{day.label}</td>
                  <td className="py-3 px-4">
                    {hour ? (
                      <input
                        type="time"
                        value={hour.openTime}
                        onChange={(e) => handleUpdateTime(hour.id, "openTime", e.target.value)}
                        className="border rounded px-2 py-1"
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {hour ? (
                      <input
                        type="time"
                        value={hour.closeTime}
                        onChange={(e) => handleUpdateTime(hour.id, "closeTime", e.target.value)}
                        className="border rounded px-2 py-1"
                      />
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {hour ? (
                      <button
                        onClick={() => handleToggleOpen(hour.id, !hour.isOpen)}
                        className={`px-3 py-1 rounded text-sm ${
                          hour.isOpen ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                      >
                        {hour.isOpen ? "Aberto" : "Fechado"}
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {hour ? (
                      <button
                        onClick={() => setEditing(hour.id)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Editar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCreate(day.value)}
                        className="text-green-600 hover:text-green-800"
                      >
                        Criar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
