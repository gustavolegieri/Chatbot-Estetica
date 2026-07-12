"use client";

import { useState, useEffect } from "react";

export default function TestCalendarDisplay() {
  const [currentMonthUrl, setCurrentMonthUrl] = useState<string>("");
  const [testMonthUrl, setTestMonthUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCalendars() {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      
      // Test with a month that starts on Wednesday (e.g., January 2025 starts on Wednesday)
      const testYear = 2025;
      const testMonth = 0; // January

      try {
        const [currentRes, testRes] = await Promise.all([
          fetch(`/api/test-calendar?year=${currentYear}&month=${currentMonth}`),
          fetch(`/api/test-calendar?year=${testYear}&month=${testMonth}`),
        ]);

        const currentData = await currentRes.json();
        const testData = await testRes.json();

        setCurrentMonthUrl(currentData.imageUrl);
        setTestMonthUrl(testData.imageUrl);
      } catch (error) {
        console.error("Error fetching calendars:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchCalendars();
  }, []);

  if (loading) {
    return <div className="p-8">Carregando calendários...</div>;
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <h1 className="text-3xl font-bold text-white mb-8">Teste de Calendário</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl font-bold text-yellow-500 mb-4">Mês Atual</h2>
          {currentMonthUrl && (
            <img src={currentMonthUrl} alt="Mês atual" className="rounded-lg shadow-lg" />
          )}
        </div>
        
        <div>
          <h2 className="text-xl font-bold text-yellow-500 mb-4">Janeiro 2025 (começa na Quarta-feira)</h2>
          {testMonthUrl && (
            <img src={testMonthUrl} alt="Janeiro 2025" className="rounded-lg shadow-lg" />
          )}
        </div>
      </div>
    </div>
  );
}
