"use client";

import { useState } from "react";
import { Send, MessageCircle, Bot } from "lucide-react";

export default function TestWebhookPage() {
  const [phone, setPhone] = useState("5511972851072");
  const [text, setText] = useState("Oi");
  const [buttonId, setButtonId] = useState("");
  const [listId, setListId] = useState("");
  const [pushName, setPushName] = useState("Teste");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async () => {
    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/test-webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          text,
          buttonId: buttonId || undefined,
          listId: listId || undefined,
          pushName,
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
          Testar Webhook WhatsApp
        </h1>
        <p className="text-gray-600">
          Simule mensagens recebidas do WhatsApp para testar o bot usando seu próprio número
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Número de Telefone</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511972851072"
            className="w-full border rounded px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">Formato: DDI + DDD + número (ex: 5511972851072)</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Mensagem</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite a mensagem..."
            rows={3}
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Button ID (opcional)</label>
            <input
              type="text"
              value={buttonId}
              onChange={(e) => setButtonId(e.target.value)}
              placeholder="1"
              className="w-full border rounded px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">List ID (opcional)</label>
            <input
              type="text"
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              placeholder="service_1"
              className="w-full border rounded px-3 py-2"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Nome do Remetente (opcional)</label>
          <input
            type="text"
            value={pushName}
            onChange={(e) => setPushName(e.target.value)}
            placeholder="Teste"
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
              Processando...
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
              <Bot className="w-5 h-5 text-green-600" />
            ) : (
              <div className="w-5 h-5 text-red-600">❌</div>
            )}
            <span className={`font-medium ${result.success ? "text-green-800" : "text-red-800"}`}>
              {result.success ? "Sucesso" : "Erro"}
            </span>
          </div>
          <p className={result.success ? "text-green-700" : "text-red-700"}>
            {result.message}
          </p>
        </div>
      )}

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">💡 Dicas de Teste</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Use &quot;menu&quot; para voltar ao menu principal</li>
          <li>• Use &quot;Oi&quot; ou &quot;Olá&quot; para iniciar o fluxo de boas-vindas</li>
          <li>• Verifique os logs do servidor para ver o processamento detalhado</li>
          <li>• Use o modo de teste nas configurações para filtrar mensagens</li>
        </ul>
      </div>
    </div>
  );
}