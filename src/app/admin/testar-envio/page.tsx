"use client";

import { useState } from "react";
import { Send, MessageCircle, CheckCircle, XCircle } from "lucide-react";

export default function TestarEnvioPage() {
  const [phone, setPhone] = useState("5511944400696");
  const [message, setMessage] = useState("Teste de envio direto via API");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/testar-envio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          message,
        }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        message: "Erro ao fazer requisição: " + (error as Error).message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <MessageCircle className="w-8 h-8" />
          Testar Envio Direto
        </h1>
        <p className="text-gray-600">
          Teste o envio de mensagens diretamente via WasenderAPI
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Número de Telefone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511944400696"
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">Formato: DDI + DDD + número (ex: 5511944400696)</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mensagem</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Digite a mensagem..."
            rows={3}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          onClick={handleTest}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Enviando...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              Enviar Mensagem de Teste
            </>
          )}
        </button>
      </div>

      {result && (
        <div className={`mt-4 p-4 rounded-lg ${result.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
          <div className="flex items-center gap-2 mb-2">
            {result.success ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            <span className={`font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "Sucesso" : "Erro"}
            </span>
          </div>
          <p className={result.success ? "text-green-700" : "text-red-700"}>
            {result.message}
          </p>
          {result.details && (
            <pre className="mt-2 text-xs bg-gray-100 p-2 rounded overflow-auto">
              {JSON.stringify(result.details, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-medium text-yellow-800 mb-2">⚠️ Importante</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>• Este teste envia a mensagem diretamente via WasenderAPI</li>
          <li>• Verifique se WASENDER_API_KEY está configurada no .env</li>
          <li>• O número deve estar formatado corretamente (DDI + DDD + número)</li>
          <li>• Use o diagnóstico para verificar a configuração completa</li>
        </ul>
      </div>
    </div>
  );
}