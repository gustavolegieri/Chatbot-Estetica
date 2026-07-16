"use client";

import { useState, useEffect, useRef } from "react";
import { Send, RefreshCw, MessageSquare, Settings, Trash2 } from "lucide-react";

interface TestBotMessage {
  text: string;
  sender: "user" | "bot";
  timestamp: string;
}

interface FlowState {
  stage: string;
  welcomed?: boolean;
  customerName?: string;
  serviceKey?: string;
  serviceLabel?: string;
  vehicleModel?: string;
  vehicleYear?: string;
  vehicleColor?: string;
  vehicleCondition?: string;
  quoteMin?: number;
  quoteMax?: number;
  dayDate?: string;
  startTime?: string;
  [key: string]: any;
}

export default function TestBotPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TestBotMessage[]>([]);
  const [flowState, setFlowState] = useState<FlowState>({ stage: "ETAPA1_AWAITING_NAME" });
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useRealAI, setUseRealAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const resetSession = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true, sessionId }),
      });

      const data = await response.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setMessages(data.messages);
        setFlowState(data.flowState);
      }
    } catch (error) {
      console.error("Erro ao resetar sessão:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: TestBotMessage = {
      text: inputText,
      sender: "user",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/test-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          sessionId,
          useRealAI,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setSessionId(data.sessionId);
        setMessages(data.messages);
        setFlowState(data.flowState);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      setMessages((prev) => [
        ...prev,
        {
          text: "❌ Erro ao processar mensagem",
          sender: "bot",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const deleteSession = async () => {
    if (!sessionId) return;

    try {
      await fetch(`/api/admin/test-bot?sessionId=${sessionId}`, {
        method: "DELETE",
      });
      setSessionId(null);
      setMessages([]);
      setFlowState({ stage: "ETAPA1_AWAITING_NAME" });
    } catch (error) {
      console.error("Erro ao deletar sessão:", error);
    }
  };

  // Inicializar sessão ao carregar a página
  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Chat Principal */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold">Test Bot</h1>
              <p className="text-sm text-gray-500">
                Simule uma conversa completa com o bot WhatsApp
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
              title="Configurações"
            >
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={resetSession}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
              Reset
            </button>
            <button
              onClick={deleteSession}
              disabled={!sessionId || isLoading}
              className="p-2 hover:bg-red-100 rounded-lg transition text-red-600"
              title="Limpar sessão"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Configurações */}
        {showSettings && (
          <div className="bg-white border-b px-6 py-4">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRealAI}
                  onChange={(e) => setUseRealAI(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Usar IA real (Cerebras)</span>
              </label>
              <span className="text-xs text-gray-500">
                Quando desligado, usa respostas determinísticas para testes
              </span>
            </div>
          </div>
        )}

        {/* Área de Mensagens */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-12">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">Nenhuma mensagem ainda</p>
                <p className="text-sm">Digite uma mensagem para começar a testar o bot</p>
              </div>
            ) : (
              messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${
                    msg.sender === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.sender === "user"
                        ? "bg-blue-500 text-white"
                        : "bg-white shadow"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        msg.sender === "user"
                          ? "text-blue-100"
                          : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.timestamp).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white shadow rounded-2xl px-4 py-3">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="bg-white border-t px-6 py-4">
          <div className="max-w-4xl mx-auto flex gap-3">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Digite sua mensagem..."
              className="flex-1 border rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={1}
              disabled={isLoading}
            />
            <button
              onClick={sendMessage}
              disabled={!inputText.trim() || isLoading}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Enviar
            </button>
          </div>
        </div>
      </div>

      {/* Painel Lateral - Estado do Flow */}
      <div className="w-96 bg-white border-l overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">Estado do Flow</h2>
          <p className="text-sm text-gray-500">FlowState em tempo real</p>
        </div>
        <div className="p-4">
          <pre className="text-xs bg-gray-50 p-4 rounded-lg overflow-auto">
            {JSON.stringify(flowState, null, 2)}
          </pre>
        </div>

        {/* Informações da Sessão */}
        <div className="p-4 border-t">
          <h3 className="font-semibold mb-2">Informações da Sessão</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Session ID:</span>
              <span className="font-mono text-xs">{sessionId?.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Etapa atual:</span>
              <span className="font-medium">{flowState.stage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Nome cliente:</span>
              <span className="font-medium">{flowState.customerName || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Serviço:</span>
              <span className="font-medium">{flowState.serviceLabel || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Veículo:</span>
              <span className="font-medium">
                {flowState.vehicleModel || flowState.vehicleYear
                  ? `${flowState.vehicleModel || ""} ${flowState.vehicleYear || ""}`
                  : "—"}
              </span>
            </div>
            {flowState.quoteMin && (
              <div className="flex justify-between">
                <span className="text-gray-500">Orçamento:</span>
                <span className="font-medium">
                  R$ {flowState.quoteMin.toFixed(2)}
                  {flowState.quoteMax && ` - R$ ${flowState.quoteMax.toFixed(2)}`}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Dicas de Teste */}
        <div className="p-4 border-t">
          <h3 className="font-semibold mb-2">Dicas de Teste</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>• Digite &quot;Oi&quot; para iniciar o fluxo</p>
            <p>• Use números para selecionar opções</p>
            <p>• &quot;menu&quot; volta ao menu principal</p>
            <p>• Reset limpa o estado e recomeça</p>
          </div>
        </div>
      </div>
    </div>
  );
}