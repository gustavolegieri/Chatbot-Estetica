"use client";

import { useEffect, useState } from "react";
import { AdminHeader } from "@/components/layout/AdminHeader";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/auditoria?limit=200');
    const json = await res.json();
    setLoading(false);
    if (json.success) setLogs(json.data || []);
  }

  return (
    <div>
      <AdminHeader title="Log de Auditoria" description="Registros de ações administrativas" />

      <div className="card">
        <h3 className="font-semibold mb-3">Últimos eventos</h3>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th>Data</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Recurso</th>
              <th>Dados</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b">
                <td>{new Date(l.createdAt).toLocaleString()}</td>
                <td>{l.userId ?? '-'}</td>
                <td>{l.action}</td>
                <td>{l.resource}</td>
                <td><pre className="text-xs">{JSON.stringify(l.data, null, 2)}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
