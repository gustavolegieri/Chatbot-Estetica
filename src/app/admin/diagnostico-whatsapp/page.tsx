"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, AlertCircle, Wrench } from "lucide-react";

interface DiagnosticResult {
  name: string;
  status: "success" | "error" | "warning";
  message: string;
  details?: string;
}

export default function DiagnosticoWhatsAppPage() {
  const [results, setResults] = useState<DiagnosticResult[]>([]);
  const [loading, setLoading] = useState(false);

  const runDiagnostics = async () => {
    setLoading(true);
    setResults([]);

    try {
      // 1. Verificar configuração da API
      const configResponse = await fetch("/api/admin/diagnostico/config");
      const configData = await configResponse.json();

      setResults([
        {
          name: "Configuração WASENDER_API_KEY",
          status: configData.hasApiKey ? "success" : "error",
          message: configData.hasApiKey ? "API Key configurada" : "API Key não configurada",
          details: configData.hasApiKey ? "Chave presente nas variáveis de ambiente" : "Configure WASENDER_API_KEY no .env"
        },
        {
          name: "Configuração WASENDER_BASE_URL",
          status: configData.hasBaseUrl ? "success" : "warning",
          message: configData.baseUrl || "Usando padrão",
          details: configData.baseUrl || "https://wasenderapi.com/api"
        }
      ]);

      // 2. Testar conexão com a API
      if (configData.hasApiKey) {
        const testResponse = await fetch("/api/admin/diagnostico/test-connection");
        const testData = await testResponse.json();

        setResults(prev => [...prev, {
          name: "Conexão com WasenderAPI",
          status: testData.success ? "success" : "error",
          message: testData.success ? "Conexão estabelecida" : "Falha na conexão",
          details: testData.message || testData.error
        }]);
      }

      // 3. Verificar configurações do WhatsApp
      const settingsResponse = await fetch("/api/admin/diagnostico/settings");
      const settingsData = await settingsResponse.json();

      setResults(prev => [...prev, {
        name: "Configurações do WhatsApp",
        status: settingsData.whatsappEnabled ? "success" : "warning",
        message: settingsData.whatsappEnabled ? "WhatsApp habilitado" : "WhatsApp desabilitado",
        details: `Modo de teste: ${settingsData.testModeEnabled ? "Ativo" : "Inativo"}`
      }]);

    } catch (error) {
      setResults(prev => [...prev, {
        name: "Diagnóstico Geral",
        status: "error",
        message: "Erro ao executar diagnósticos",
        details: (error as Error).message
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case "error":
        return <XCircle className="w-5 h-5 text-red-600" />;
      case "warning":
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "success":
        return "bg-green-50 border-green-200";
      case "error":
        return "bg-red-50 border-red-200";
      case "warning":
        return "bg-yellow-50 border-yellow-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Wrench className="w-8 h-8" />
          Diagnóstico WhatsApp
        </h1>
        <p className="text-gray-600">
          Verifique a configuração e conexão do sistema WhatsApp
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={runDiagnostics}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {loading ? "Executando..." : "Executar Diagnóstico"}
        </button>
      </div>

      <div className="space-y-4">
        {results.map((result, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 ${getStatusColor(result.status)}`}
          >
            <div className="flex items-start gap-3">
              {getStatusIcon(result.status)}
              <div className="flex-1">
                <h3 className="font-medium mb-1">{result.name}</h3>
                <p className="text-sm">{result.message}</p>
                {result.details && (
                  <p className="text-xs mt-2 text-gray-600">{result.details}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {results.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          Clique em &quot;Executar Diagnóstico&quot; para verificar a configuração
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-800 mb-2">📋 Como Configurar WasenderAPI</h3>
        <ol className="text-sm text-blue-700 space-y-2 list-decimal list-inside">
          <li>Acesse https://wasenderapi.com e crie uma conta</li>
          <li>Crie uma instância de WhatsApp</li>
          <li>Obtenha a API Key no painel</li>
          <li>Configure WASENDER_API_KEY no .env:</li>
          <li className="ml-4 font-mono text-xs bg-blue-100 p-2 rounded">
            WASENDER_API_KEY=sua_chave_aqui
          </li>
          <li>Opcionalmente, configure WASENDER_BASE_URL se necessário:</li>
          <li className="ml-4 font-mono text-xs bg-blue-100 p-2 rounded">
            WASENDER_BASE_URL=https://wasenderapi.com/api
          </li>
        </ol>
      </div>
    </div>
  );
}