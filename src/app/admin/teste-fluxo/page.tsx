"use client";

import { useState, useEffect } from "react";

interface TestLog {
  timestamp: string;
  step: string;
  status: 'success' | 'error' | 'pending';
  message: string;
}

export default function TesteFluxoPage() {
  const [phone, setPhone] = useState("5511972851072");
  const [selectedStep, setSelectedStep] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [testMode, setTestMode] = useState<'individual' | 'sequence'>('individual');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sequenceProgress, setSequenceProgress] = useState(0);

  const steps = [
    { id: 'welcome', name: 'Boas-vindas', description: 'Mensagem inicial do bot', icon: '👋' },
    { id: 'menu', name: 'Menu Principal', description: 'Exibe opções principais do sistema', icon: '📋' },
    { id: 'service_detail', name: 'Detalhe de Serviço', description: 'Mostra detalhes de um serviço específico', icon: '🧽' },
    { id: 'package', name: 'Pacotes', description: 'Mostra pacotes disponíveis', icon: '📦' },
    { id: 'vehicle', name: 'Seleção de Veículo', description: 'Solicita informações do veículo', icon: '🚗' },
    { id: 'vehicle_confirm', name: 'Confirmação Veículo', description: 'Confirma os dados do veículo', icon: '✅' },
    { id: 'quote', name: 'Cotação', description: 'Exibe preço estimado', icon: '💰' },
    { id: 'upsell', name: 'Upsell', description: 'Oferece serviços complementares', icon: '⭐' },
    { id: 'day', name: 'Seleção de Data', description: 'Solicita data do agendamento', icon: '📅' },
    { id: 'time', name: 'Seleção de Horário', description: 'Solicita horário do agendamento', icon: '⏰' },
    { id: 'payment', name: 'Formas de Pagamento', description: 'Exibe opções de pagamento', icon: '💳' },
    { id: 'payment_pix', name: 'Pagamento PIX', description: 'Instruções de pagamento PIX', icon: '📱' },
    { id: 'logistics', name: 'Logística', description: 'Opções de entrega/retirada', icon: '🚚' },
    { id: 'calendar', name: 'Calendário', description: 'Envia imagem do calendário', icon: '📆' },
    { id: 'summary', name: 'Resumo', description: 'Resumo do agendamento', icon: '📝' },
    { id: 'confirmation', name: 'Confirmação', description: 'Confirmação final do agendamento', icon: '✅' },
  ];

  const addLog = (step: string, status: 'success' | 'error' | 'pending', message: string) => {
    const newLog: TestLog = {
      timestamp: new Date().toLocaleTimeString(),
      step,
      status,
      message
    };
    setLogs(prev => [...prev, newLog]);
  };

  const testIndividualStep = async () => {
    if (!selectedStep) {
      alert('Selecione uma etapa para testar');
      return;
    }

    setIsRunning(true);
    setLogs([]);
    addLog(selectedStep, 'pending', 'Iniciando teste...');

    try {
      const response = await fetch('/api/admin/teste-fluxo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          step: selectedStep,
          mode: 'individual'
        })
      });

      const result = await response.json();

      if (result.success) {
        addLog(selectedStep, 'success', result.message || 'Etapa enviada com sucesso');
      } else {
        addLog(selectedStep, 'error', result.error || 'Erro ao enviar etapa');
      }
    } catch (error) {
      addLog(selectedStep, 'error', 'Erro na requisição');
    } finally {
      setIsRunning(false);
    }
  };

  const testSequence = async () => {
    setIsRunning(true);
    setLogs([]);
    setSequenceProgress(0);
    addLog('sequence', 'pending', 'Iniciando teste em sequência...');

    try {
      const response = await fetch('/api/admin/teste-fluxo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          mode: 'sequence'
        })
      });

      const result = await response.json();

      if (result.success) {
        setSessionId(result.sessionId);
        addLog('sequence', 'success', 'Teste em sequência iniciado');
        addLog('sequence', 'pending', 'Aguardando 1 minuto entre cada etapa...');
      } else {
        addLog('sequence', 'error', result.error || 'Erro ao iniciar teste');
        setIsRunning(false);
      }
    } catch (error) {
      addLog('sequence', 'error', 'Erro na requisição');
      setIsRunning(false);
    }
  };

  // Poll para verificar status da sequência
  useEffect(() => {
    if (!sessionId || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        const statusResponse = await fetch(`/api/admin/teste-fluxo/status?sessionId=${sessionId}`);
        const statusData = await statusResponse.json();
        
        if (statusData.completed) {
          clearInterval(interval);
          setIsRunning(false);
          setSequenceProgress(100);
          addLog('sequence', 'success', 'Teste em sequência concluído');
          setSessionId(null);
        } else if (statusData.currentStep) {
          setSequenceProgress((statusData.currentStep / steps.length) * 100);
          addLog(statusData.currentStepName || `Etapa ${statusData.currentStep}`, 'success', `Etapa ${statusData.currentStep}/${steps.length} concluída`);
        }
      } catch (error) {
        clearInterval(interval);
        setIsRunning(false);
        addLog('sequence', 'error', 'Erro ao verificar status');
        setSessionId(null);
      }
    }, 5000); // Verifica a cada 5 segundos

    return () => clearInterval(interval);
  }, [sessionId, isRunning, steps.length]);

  const getStatusColor = (status: TestLog['status']) => {
    switch (status) {
      case 'success': return 'text-green-600 bg-green-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'pending': return 'text-yellow-600 bg-yellow-50';
    }
  };

  const getStatusIcon = (status: TestLog['status']) => {
    switch (status) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'pending': return '⏳';
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Teste de Fluxo do Bot</h1>

      {/* Configurações */}
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-xl font-bold mb-4">Configurações</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Número de Teste</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5511972851072"
            className="border rounded px-3 py-2 w-full max-w-md"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Modo de Teste</label>
          <div className="flex gap-4">
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="individual"
                checked={testMode === 'individual'}
                onChange={(e) => setTestMode(e.target.value as 'individual')}
                className="mr-2"
              />
              <span>Etapa Individual</span>
            </label>
            <label className="flex items-center cursor-pointer">
              <input
                type="radio"
                value="sequence"
                checked={testMode === 'sequence'}
                onChange={(e) => setTestMode(e.target.value as 'sequence')}
                className="mr-2"
              />
              <span>Sequência Automática</span>
            </label>
          </div>
        </div>
      </div>

      {/* Teste Individual */}
      {testMode === 'individual' && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">Teste de Etapa Individual</h2>
          
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Selecione a Etapa</label>
            <select
              value={selectedStep}
              onChange={(e) => setSelectedStep(e.target.value)}
              className="border rounded px-3 py-2 w-full max-w-md"
            >
              <option value="">Selecione...</option>
              {steps.map(step => (
                <option key={step.id} value={step.id}>
                  {step.icon} {step.name} - {step.description}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={testIndividualStep}
            disabled={isRunning || !selectedStep}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            {isRunning ? 'Enviando...' : 'Enviar Etapa'}
          </button>
        </div>
      )}

      {/* Teste em Sequência */}
      {testMode === 'sequence' && (
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">Teste em Sequência Automática</h2>
          
          <p className="text-gray-600 mb-4">
            Este modo enviará todas as etapas em sequência, aguardando 1 minuto entre cada uma
            devido ao rate limit da API do WhatsApp.
          </p>

          {/* Barra de Progresso */}
          {isRunning && (
            <div className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium">Progresso</span>
                <span className="text-sm font-medium">{Math.round(sequenceProgress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div 
                  className="bg-green-500 h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${sequenceProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <h3 className="font-medium mb-2">Etapas que serão testadas:</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-2 text-sm text-gray-600 p-2 bg-gray-50 rounded">
                  <span className="font-mono text-xs">{index + 1}.</span>
                  <span>{step.icon}</span>
                  <span>{step.name}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={testSequence}
            disabled={isRunning}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition"
          >
            {isRunning ? 'Executando Sequência...' : 'Iniciar Sequência'}
          </button>
        </div>
      )}

      {/* Logs */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Logs de Execução</h2>
          <button
            onClick={clearLogs}
            className="text-sm text-gray-500 hover:text-gray-700 transition"
          >
            Limpar Logs
          </button>
        </div>
        
        {logs.length === 0 ? (
          <p className="text-gray-500">Nenhum log ainda</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {logs.map((log, index) => (
              <div key={index} className={`p-3 rounded-lg border ${getStatusColor(log.status)}`}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getStatusIcon(log.status)}</span>
                  <span className="text-sm font-medium">{log.timestamp}</span>
                  <span className="font-bold">{log.step}</span>
                </div>
                <p className="text-sm mt-1">{log.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
