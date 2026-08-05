// Página de teste simples para Google Images Scraping
import React, { useState } from 'react';
import { useDiagnosisImageSearch } from '@/hooks/useDiagnosisImageSearch';

export default function GoogleImagesTestPage() {
  const [diagnosisId, setDiagnosisId] = useState('test-diagnosis-id');
  const [section, setSection] = useState('estilo');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { searchImage } = useDiagnosisImageSearch();

  const testData = {
    questionnaire: {
      estiloPersonalidade: 'Moderno e minimalista',
      psicometrico: { paleta: 'paleta_neutra' },
      tecidosPreferidos: ['Seda'],
      coresQueTeFazemBrilhar: ['Azul marinho'],
    },
    colorAnalysis: {
      cores: ['azul marinho', 'cinza', 'branco'],
      tomDePele: 'Médio',
    },
    styleAnalysis: {
      estilo: 'moderno minimalista',
    },
  };

  const sections = ['estilo', 'cores', 'corpo', 'modelagens', 'essenciais', 'capsula'];

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchImage({
        diagnosisId,
        section,
        questionnaire: testData.questionnaire,
        colorAnalysis: testData.colorAnalysis,
        styleAnalysis: testData.styleAnalysis,
        skinTone: 'Médio',
        seed: Math.floor(Math.random() * 10000),
        mode: 'editorial',
      });

      if (result) {
        setResults(prev => [...prev, {
          timestamp: new Date().toISOString(),
          section,
          provider: result.provider,
          imageUrl: result.imageUrl,
          queryUsed: result.queryUsed,
          poolSize: result.poolSize,
          message: result.message,
        }]);
      }
    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Teste: Google Images Scraping</h1>
        <p className="text-gray-600 mb-6">Teste a busca de imagens via scraping do Google Images</p>
        
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Configuração do Teste</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Diagnosis ID:</label>
              <input
                type="text"
                value={diagnosisId}
                onChange={(e) => setDiagnosisId(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="ID do diagnóstico para teste"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Seção:</label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full p-2 border rounded"
              >
                {sections.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            <button
              onClick={handleTest}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? 'Buscando...' : 'Testar Busca'}
            </button>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-600">
              <strong>Erro:</strong> {error}
            </div>
          )}
        </div>

        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Resultados dos Testes</h2>
            <div className="space-y-6">
              {results.map((result, index) => (
                <div key={index} className="border rounded p-4">
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <span className="font-medium">Timestamp:</span> {result.timestamp}
                    </div>
                    <div>
                      <span className="font-medium">Seção:</span> {result.section}
                    </div>
                    <div>
                      <span className="font-medium">Provider:</span> {result.provider}
                    </div>
                    <div>
                      <span className="font-medium">Pool Size:</span> {result.poolSize}
                    </div>
                    <div className="col-span-2">
                      <span className="font-medium">Query:</span> {result.queryUsed}
                    </div>
                    {result.message && (
                      <div className="col-span-2 text-red-600">
                        <span className="font-medium">Message:</span> {result.message}
                      </div>
                    )}
                  </div>
                  
                  {result.imageUrl ? (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">Imagem encontrada:</p>
                      <img
                        src={result.imageUrl}
                        alt="Test result"
                        className="w-full h-64 object-cover rounded"
                        onError={() => console.error('Erro ao carregar imagem')}
                        onLoad={() => console.log('Imagem carregada com sucesso')}
                      />
                      <p className="text-xs text-gray-500 mt-2 break-all">
                        URL: {result.imageUrl}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 p-4 bg-gray-100 rounded text-gray-600">
                      Nenhuma imagem encontrada para esta busca
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold mb-2">Informações do Teste:</h3>
          <ul className="text-sm space-y-1">
            <li>• O sistema usa scraping direto do Google Images</li>
            <li>• Se o scraping falhar, usa DuckDuckGo como fallback</li>
            <li>• Filtros automáticos removem domínios de stock photos</li>
            <li>• As imagens são baseadas no perfil do diagnóstico</li>
            <li>• Verifique o console do navegador para logs detalhados</li>
          </ul>
        </div>
      </div>
    </div>
  );
}