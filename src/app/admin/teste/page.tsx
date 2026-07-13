"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw, Loader, Clock, Calendar, Upload, X } from "lucide-react";

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
  const [testHours, setTestHours] = useState("");
  const [testDate, setTestDate] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [simulatedReceiptValue, setSimulatedReceiptValue] = useState("");
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
      const body: Record<string, any> = { sessionId: testSessionId };
      // Se o usuário informou um horário de teste, envia para o backend
      if (testHours && /^\d{1,2}:\d{2}$/.test(testHours)) {
        body.testHours = testHours;
      }
      // Se o usuário informou uma data de teste, envia para o backend
      if (testDate && /^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
        body.testDate = testDate;
      }

      const response = await fetch("/api/admin/teste/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
    setUploadedFile(null);
    initializeTest();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/midia/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.success && data.url) {
        setUploadedFile(file);
        // Se tiver valor simulado, adiciona à URL para o analyzer reconhecer
        const receiptUrl = simulatedReceiptValue
          ? `${data.url}?valor${simulatedReceiptValue.replace('.', '')}`
          : data.url;
        setInput(receiptUrl);
      } else {
        alert("Erro ao fazer upload do arquivo");
      }
    } catch (error) {
      console.error("Erro ao fazer upload:", error);
      alert("Erro ao fazer upload do arquivo");
    } finally {
      setUploading(false);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setInput("");
    setSimulatedReceiptValue("");
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
        <div className="flex items-center gap-3">
          {/* 📅 Simulador de data */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5">
            <Calendar className="h-4 w-4 text-slate-400" />
            <input
              type="date"
              value={testDate}
              onChange={(e) => setTestDate(e.target.value)}
              className="w-36 rounded bg-slate-700/50 px-2 py-1 text-xs text-slate-300 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              placeholder="Data"
              title="Simular data (deixe vazio para usar a data real)"
            />
          </div>
          {/* ⏰ Simulador de horário */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5">
            <Clock className="h-4 w-4 text-slate-400" />
            <input
              type="time"
              value={testHours}
              onChange={(e) => setTestHours(e.target.value)}
              className="w-28 rounded bg-slate-700/50 px-2 py-1 text-xs text-slate-300 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              placeholder="Horário"
              title="Simular horário (deixe vazio para usar o horário real)"
            />
          </div>
          {/* 💰 Simulador de valor do comprovante */}
          <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-1.5">
            <span className="text-xs text-slate-400">R$</span>
            <input
              type="number"
              step="0.01"
              value={simulatedReceiptValue}
              onChange={(e) => setSimulatedReceiptValue(e.target.value)}
              className="w-24 rounded bg-slate-700/50 px-2 py-1 text-xs text-slate-300 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              placeholder="Valor"
              title="Simular valor do comprovante para teste (ex: 50.00)"
            />
          </div>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-600"
          >
            <RotateCcw className="h-4 w-4" />
            Reiniciar
          </button>
        </div>
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
        {uploadedFile && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2">
            <div className="flex-1">
              <p className="text-xs text-slate-300">{uploadedFile.name}</p>
              <p className="text-xs text-slate-500">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
            </div>
            <button
              type="button"
              onClick={clearUploadedFile}
              className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="relative">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept="image/*,.pdf"
              onChange={handleFileUpload}
              disabled={loading || uploading}
            />
            <label
              htmlFor="file-upload"
              className={`inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-700 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed ${
                uploading ? "cursor-wait" : "cursor-pointer"
              }`}
            >
              {uploading ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Arquivo</span>
            </label>
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            placeholder="Digite sua mensagem ou envie um arquivo..."
            className="flex-1 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || uploading || (!input.trim() && !uploadedFile)}
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
