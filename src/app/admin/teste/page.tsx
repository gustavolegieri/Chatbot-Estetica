"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw, Loader } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "bot";
  content: string;
  mediaUrl?: string;
  mediaType?: string;
}

export default function TesteBotPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [testSessionId] = useState(() => `test-${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Inicia o teste com mensagem de boas-vindas do bot
  useEffect(() => {
    initializeTest();
  }, []);

  const initializeTest = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/teste/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: testSessionId }),
      });

      const data = await response.json();
      if (data.success && data.messages) {
        setMessages(data.messages);
      }
    } catch (error) {
      console.error("Erro ao inicializar teste:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/teste/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: testSessionId,
          message: input,
        }),
      });

      const data = await response.json();
      if (data.success && data.responses) {
        const botMessages = data.responses.map((msg: any, idx: number) => ({
          id: `bot-${Date.now()}-${idx}`,
          role: "bot" as const,
          content: msg.text,
          mediaUrl: msg.mediaUrl,
          mediaType: msg.mediaType,
        }));
        setMessages((prev) => [...prev, ...botMessages]);
      }
    } catch (error) {
      console.error("Erro ao enviar mensagem:", error);
      const errorMsg: Message = {
        id: `error-${Date.now()}`,
        role: "bot",
        content: "❌ Erro ao processar mensagem. Tente novamente.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
    initializeTest();
  };

  return (
    <div className="flex h-[calc(100vh-120px)] flex-col rounded-lg border border-slate-700/50 bg-slate-950 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/50 bg-gradient-to-r from-brand-900/30 to-slate-900/50 px-6 py-4">
        <div>
          <h1 className="text-xl font-bold text-brand-300">🤖 Teste de Bot</h1>
          <p className="mt-1 text-sm text-slate-400">
            Simule conversas com o bot usando os fluxos configurados
          </p>
        </div>
        <button
          onClick={handleReset}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
        >
          <RotateCcw className="h-4 w-4" />
          Reiniciar
        </button>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mb-4 text-4xl">💬</div>
              <p className="text-slate-400">
                Envie uma mensagem para começar o teste
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-brand-600 text-white"
                      : "bg-slate-800 text-slate-100"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">
                    {msg.content}
                  </p>
                  {msg.mediaUrl && (
                    <div className="mt-2">
                      {msg.mediaType?.startsWith("image") ? (
                        <img
                          src={msg.mediaUrl}
                          alt="Media"
                          className="max-w-xs rounded"
                        />
                      ) : msg.mediaType?.startsWith("video") ? (
                        <video
                          src={msg.mediaUrl}
                          controls
                          className="max-w-xs rounded"
                        />
                      ) : (
                        <a
                          href={msg.mediaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-300 hover:underline"
                        >
                          📎 Download mídia
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-700/50 bg-slate-900/50 p-4">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Digite sua mensagem..."
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
}
