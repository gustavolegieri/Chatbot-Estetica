/**
 * Script de teste automatizado do fluxo completo do bot
 * Percorre todas as 23 etapas do fluxo-oficial.md e compara as respostas
 * com o texto/estrutura esperado
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { getDefaultInput, expectedTextsByStage, isAllowedTransition } from './src/lib/test-harness-utils';

// Carregar .env.test explicitamente ANTES de qualquer outro
const envConfig = config({ path: '.env.test' });

// Forçar DATABASE_URL do .env.test
process.env.DATABASE_URL = envConfig.parsed?.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/estetica_automotiva?schema=public';

// Configurações
const TEST_PHONE = '5511972851072'; // Telefone autorizado pelo modo de teste
const prisma = new PrismaClient();

// Flag para indicar modo de teste (evita envios reais)
process.env.TEST_MODE = 'true';
process.env.WASENDER_API_KEY = ''; // Forçar modo simulado

// Interfaces
interface TestResult {
  etapa: string;
  status: 'OK' | 'DIVERGENTE_TEXTO' | 'DESVIO_ROTA' | 'ERRO' | 'LOOP_DETECTADO';
  stageEsperado?: string;
  stageRecebido?: string;
  esperado: string;
  recebido: string;
  timestamp?: Date;
  diff?: string;
}

interface TestReport {
  totalEtapas: number;
  ok: number;
  divergenteTexto: number;
  desvioRota: number;
  erros: number;
  loopDetectado: number;
  resultados: TestResult[];
}

// Ler o fluxo-oficial.md
const fluxoOficialPath = join(__dirname, 'fluxo-oficial.md');
const fluxoOficialContent = readFileSync(fluxoOficialPath, 'utf-8');

// Extrair textos esperados do fluxo-oficial.md
function extrairTextosEsperados(): Record<string, string> {
  const textos: Record<string, string> = {};
  const linhas = fluxoOficialContent.split('\n');
  
  let etapaAtual = '';
  let blocoTexto = false;
  let textoAtual = '';
  
  for (const linha of linhas) {
    // Detectar início de etapa (ex: "## 1. BOAS-VINDAS (`startFlow`)")
    // Regex ajustado: captura número e nome até o backtick ou final da linha
    const matchEtapa = linha.match(/^##\s+(\d+)\.\s+(.+?)(?:\s+`|$)/);
    if (matchEtapa) {
      // Salvar etapa anterior se houver
      if (etapaAtual && textoAtual.trim()) {
        textos[etapaAtual] = textoAtual.trim();
      }

      etapaAtual = `${matchEtapa[1]}. ${matchEtapa[2]}`;
      textoAtual = '';
      blocoTexto = false;
      continue;
    }
    
    // Detectar bloco de código (texto esperado)
    if (linha.trim() === '```') {
      blocoTexto = !blocoTexto;
      continue;
    }
    
    // Coletar texto dentro do bloco
    if (blocoTexto && etapaAtual) {
      textoAtual += linha + '\n';
    }
  }
  
  // Salvar última etapa
  if (etapaAtual && textoAtual.trim()) {
    textos[etapaAtual] = textoAtual.trim();
  }
  
  // Debug: mostrar o que foi extraído
  console.log('📝 Textos esperados extraídos:', Object.keys(textos).length);
  for (const [key, value] of Object.entries(textos)) {
    console.log(`   ${key}: ${value.substring(0, 50)}...`);
  }

  // Se não extraiu nada, usar fallback com textos simples
  if (Object.keys(textos).length === 0) {
    console.log('⚠️ Falha na extração automática, usando textos fallback...');
    return {
      '1. BOAS-VINDAS': 'Seja muito bem-vindo',
      '2. COLETA DE NOME': 'qual é o seu nome',
      '3. MENU PRINCIPAL': 'O que você precisa',
      '4. SUBMENU': 'serviços disponíveis',
      '5. CLIENTE INDECISO - VEÍCULO': 'Qual é o modelo',
      '6. CLIENTE INDECISO - PROBLEMA': 'recomendo',
      '7. AÇÕES COM PACOTES': 'Pacotes',
      '8. AÇÕES APÓS SERVIÇO': 'Agendar',
      '9. COLETA DE VEÍCULO': 'Confirmando os dados',
      '10. ORÇAMENTO': 'Bônus',
      '11. BÔNUS PRIMEIRA VEZ': 'Desconto aplicado',
      '12. UPSELL': 'adicionar',
      '13. ESCOLHA DE DIA': 'calendário',
      '14. ESCOLHA DE HORÁRIO': 'horários disponíveis',
      '15. CUPOM': 'cupom',
      '16. PONTOS DE FIDELIDADE': 'pontos',
      '17. CONFIRMAÇÃO DE ORÇAMENTO': 'orçamento',
      '18. LOGÍSTICA': 'Como prefere',
      '19. PAGAMENTO': 'pagar',
      '20. ESCOLHA PIX': 'PIX',
      '21. COMPROVANTE': 'comprovante',
      '22. LEMBRETE': 'lembrete',
      '23. RESUMO E CONFIRMAÇÃO': 'resumo',
    };
  }

  return textos;
}

const textosEsperados = extrairTextosEsperados();

// Função para decidir próximo input baseado no stage atual e contexto da resposta
function decidirProximoInput(stageAtual: string, respostaBot: string, visitCount: Record<string, number>): string {
  // Incrementar contador para este stage
  visitCount[stageAtual] = (visitCount[stageAtual] || 0) + 1;
  return getDefaultInput(stageAtual, respostaBot, visitCount);
}

// Textos esperados por stage (simplificados para comparação)
// Centralizados em utilitário
const textosEsperadosPorStage = expectedTextsByStage;

// Testes de regras cross-cutting (serão testados separadamente)
const testesCrossCutting: Record<string, { etapa: string; mensagem: string; descricao: string }> = {
  'CROSS-CUTTING 1 - Small talk': {
    etapa: 'ETAPA2_MAIN_MENU',
    mensagem: 'pera aí',
    descricao: 'Small talk "pera aí" deve reimprimir menu sem avançar'
  },
  'CROSS-CUTTING 2 - Pergunta': {
    etapa: 'ETAPA2_MAIN_MENU',
    mensagem: 'quanto custa?',
    descricao: 'Pergunta deve acionar IA e reimprimir menu'
  },
};

// Importar processWhatsAppMessage dinamicamente após configurar ambiente
let processWhatsAppMessage: any = null;

async function carregarProcessador() {
  // Carregar módulo dinamicamente após configurar env vars
  const botModule = await import('./src/lib/whatsapp-bot');
  processWhatsAppMessage = botModule.processWhatsAppMessage;
}

// Função para chamar processWhatsAppMessage diretamente e capturar resposta real do banco
async function enviarMensagemTeste(text: string, etapa: string): Promise<{ resposta: string; timestamp: Date; flowStage?: string }> {
  try {
    // Carregar processador na primeira chamada
    if (!processWhatsAppMessage) {
      await carregarProcessador();
    }
    
    // Registrar timestamp ANTES de enviar
    const timestampAntes = new Date();
    
    // Chamar processWhatsAppMessage diretamente
    await processWhatsAppMessage({
      phone: TEST_PHONE,
      text,
      pushName: 'Teste Automatizado',
    });

    // Polling com retry para capturar resposta (até 15s, tentando a cada 300ms)
    const maxTentativas = 50; // 50 * 300ms = 15s
    const intervaloPoll = 300; // 300ms entre tentativas
    
    for (let i = 0; i < maxTentativas; i++) {
      await new Promise(resolve => setTimeout(resolve, intervaloPoll));
      
      const mensagem = await prisma.whatsAppMessage.findFirst({
        where: {
          phone: TEST_PHONE,
          direction: 'OUTBOUND',
          sender: 'BOT',
          createdAt: {
            gt: timestampAntes,
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (mensagem) {
        const session = await prisma.whatsAppSession.findUnique({
          where: { phone: TEST_PHONE },
        });

        const flowStageFromSession = session?.metadata ? (session.metadata as any).stage : undefined;

        return {
          resposta: mensagem.body || '[Mensagem sem corpo]',
          timestamp: mensagem.createdAt,
          flowStage: flowStageFromSession || mensagem.flowStage || undefined,
        };
      }
    }

    return {
      resposta: `[Timeout: nenhuma mensagem encontrada após 15s para: "${text}"]`,
      timestamp: timestampAntes,
      flowStage: undefined,
    };
  } catch (error) {
    console.error(`Erro ao enviar mensagem para etapa ${etapa}:`, error);
    throw error;
  }
}

// Helpers de comparação de texto esperado
function normalizeText(text: string) {
  return text.toLowerCase().trim()
    .replace(/\s+/g, ' ') // Normalizar espaços
    .replace(/[^\w\sà-úá-úãõâêîôûäëïöü]/g, ''); // Remover pontuação (exceto acentos)
}

function compararTexto(esperado: string | string[], recebido: string): { ok: boolean; diff?: string } {
  const esperadoArray = Array.isArray(esperado) ? esperado : [esperado];
  const recebidoNorm = normalizeText(recebido);

  let bestDiff: string | undefined;

  for (const item of esperadoArray) {
    const esperadoNorm = normalizeText(item);

    // Se o esperado for muito curto, verificar inclusão
    if (esperadoNorm.length < 20) {
      if (recebidoNorm.includes(esperadoNorm)) {
        return { ok: true };
      }
      bestDiff = `Esperava conter: "${esperadoNorm}"\nRecebeu: "${recebidoNorm}"`;
      continue;
    }

    const palavrasEsperadas = esperadoNorm.split(' ').filter(w => w.length > 3);
    const palavrasRecebidas = recebidoNorm.split(' ').filter(w => w.length > 3);
    const palavrasEncontradas = palavrasEsperadas.filter(p => palavrasRecebidas.includes(p));
    const similaridade = palavrasEncontradas.length / Math.max(palavrasEsperadas.length, 1);

    if (similaridade >= 0.7) {
      return { ok: true };
    }

    const diff = `Similaridade: ${(similaridade * 100).toFixed(0)}%\nPalavras esperadas: ${palavrasEsperadas.join(', ')}\nPalavras encontradas: ${palavrasEncontradas.join(', ')}`;
    bestDiff = bestDiff ? `${bestDiff}\n---\n${diff}` : diff;
  }

  return {
    ok: false,
    diff: bestDiff ?? 'Nenhum texto esperado definido.',
  };
}

// Função principal de teste - agora stateful, guiada por flowStage
async function executarTesteFluxo(): Promise<TestReport> {
  const resultados: TestResult[] = [];
  const visitCount: Record<string, number> = {};
  const stageRepetitionCount: Record<string, number> = {}; // Para detecção de loop
  const lastResponseText: Record<string, string> = {}; // Para detectar mudança de texto dentro do mesmo stage
  let stageAtual: string | null = null;
  let etapaNumero = 1;
  const maxEtapas = 30; // Limite de segurança para evitar loop infinito

  console.log('🧪 Iniciando teste automatizado stateful do fluxo...');
  console.log(`📱 Telefone de teste: ${TEST_PHONE}\n`);

  while (etapaNumero <= maxEtapas) {
    console.log(`\n📍 Etapa #${etapaNumero} - Stage atual: ${stageAtual || 'null'}`);

    // Decidir próximo input baseado no stage atual E resposta anterior
    // Precisamos capturar a resposta anterior primeiro
    let respostaAnterior = '';
    if (resultados.length > 0) {
      respostaAnterior = resultados[resultados.length - 1].recebido;
    }

    const inputEsperado = decidirProximoInput(stageAtual || 'null', respostaAnterior, visitCount);
    console.log(`   Enviando: "${inputEsperado}"`);

    try {
      const { resposta, timestamp, flowStage } = await enviarMensagemTeste(inputEsperado, `#${etapaNumero}`);

      // Detecção de loop: mesmo stage E mesmo texto repetindo 3+ vezes (loop real)
      // Se o texto mudou, é progresso dentro do mesmo stage (ex: modelo → cor → estado)
      if (flowStage) {
        const respostaNormalizada = resposta.toLowerCase().trim();
        const chaveLoop = `${flowStage}|${respostaNormalizada.substring(0, 50)}`; // Primeiros 50 chars como fingerprint

        // Se mudou o texto dentro do mesmo stage, reset contador (indica progresso)
        if (lastResponseText[flowStage] && lastResponseText[flowStage] !== respostaNormalizada.substring(0, 50)) {
          stageRepetitionCount[flowStage] = 0; // Reset - texto mudou, é progresso
        }

        lastResponseText[flowStage] = respostaNormalizada.substring(0, 50);
        stageRepetitionCount[flowStage] = (stageRepetitionCount[flowStage] || 0) + 1;

        if (stageRepetitionCount[flowStage] >= 3) {
          console.log(`   🔄 LOOP DETECTADO: Stage ${flowStage} repetiu ${stageRepetitionCount[flowStage]} vezes COM MESMO TEXTO`);
          resultados.push({
            etapa: `#${etapaNumero}`,
            status: 'LOOP_DETECTADO',
            stageRecebido: flowStage,
            esperado: inputEsperado,
            recebido: resposta,
            timestamp,
            diff: `Loop detectado: stage ${flowStage} repetiu ${stageRepetitionCount[flowStage]} vezes com mesmo texto (travado)`,
          });
          break; // Interrompe o teste imediatamente
        }
      }
      
      // Verificar se houve desvio de rota com base no próximo stage esperado
      const nextStageExpectation: Record<string, string> = {
        null: 'ETAPA1_AWAITING_NAME',
        ETAPA1_AWAITING_NAME: 'ETAPA2_MAIN_MENU',
        ETAPA2_MAIN_MENU: 'ETAPA2_SUB',
        ETAPA2_SUB: 'ETAPA3_SERVICE_ACTION',
        ETAPA3_SERVICE_ACTION: 'ETAPA4_VEHICLE',
        ETAPA4_VEHICLE: 'ETAPA4_VEHICLE',
        ETAPA5_QUOTE: 'ETAPA6_UPSELL',
        ETAPA6_UPSELL: 'ETAPA7_DAY',
        ETAPA7_DAY: 'ETAPA7_TIME',
        ETAPA7_TIME: 'ETAPA10_BUDGET',
        ETAPA9_COUPON: 'ETAPA9_LOYALTY',
        ETAPA9_LOYALTY: 'ETAPA10_BUDGET',
        ETAPA10_BUDGET: 'ETAPA10_LOGISTICS',
        ETAPA10_LOGISTICS: 'ETAPA8_PAYMENT',
        ETAPA8_PAYMENT: 'ETAPA8_PIX_CHOICE',
        ETAPA8_PIX_CHOICE: 'ETAPA8_RECEIPT_UPLOAD',
        ETAPA8_RECEIPT_UPLOAD: 'ETAPA14_REMINDER',
        ETAPA14_REMINDER: 'ETAPA15_SUMMARY_CONFIRM',
        ETAPA15_SUMMARY_CONFIRM: 'ETAPA16_CONFIRMATION',
      };

      const stageEsperado = nextStageExpectation[stageAtual || 'null'];
      // Allow some stages to advance to multiple valid next stages
      const et4AllowedAdvance = stageAtual === 'ETAPA4_VEHICLE' && (flowStage === 'ETAPA4_VEHICLE' || flowStage === 'ETAPA5_QUOTE');
      const et5AllowedAdvance = stageAtual === 'ETAPA5_QUOTE' && (flowStage === 'ETAPA6_UPSELL' || flowStage === 'ETAPA7_DAY' || flowStage === 'ETAPA5_FIRST_TIME_BONUS');
      const et7TimeAllowed = stageAtual === 'ETAPA7_TIME' && (flowStage === 'ETAPA9_COUPON' || flowStage === 'ETAPA10_BUDGET' || flowStage === 'ETAPA9_LOYALTY');

      const desvioRota =
        Boolean(stageEsperado && flowStage && flowStage !== stageEsperado) &&
        !(et4AllowedAdvance || et5AllowedAdvance || et7TimeAllowed);

      // Comparar texto
      const textoEsperado = textosEsperadosPorStage[flowStage || 'null'] || textosEsperadosPorStage[stageAtual || 'null'] || '';
      const comparacao = textoEsperado ? compararTexto(textoEsperado, resposta) : { ok: true };
      
      // Determinar status
      let status: 'OK' | 'DIVERGENTE_TEXTO' | 'DESVIO_ROTA' | 'ERRO';
      if (desvioRota) {
        status = 'DESVIO_ROTA';
      } else if (!comparacao.ok) {
        status = 'DIVERGENTE_TEXTO';
      } else {
        status = 'OK';
      }
      
      const resultado: TestResult = {
        etapa: `#${etapaNumero}`,
        status,
        stageEsperado: stageEsperado,
        stageRecebido: flowStage,
        esperado: textoEsperado || '(não definido)',
        recebido: resposta,
        timestamp,
        diff: comparacao.diff || (desvioRota ? `Esperava stage: ${stageEsperado}, recebeu: ${flowStage}` : undefined),
      };
      
      resultados.push(resultado);
      
      if (status === 'OK') {
        console.log(`   ✅ OK (${timestamp?.toISOString()}) - Stage: ${flowStage}`);
      } else if (status === 'DESVIO_ROTA') {
        console.log(`   ⚠️ DESVIO DE ROTA (${timestamp?.toISOString()})`);
        console.log(`      Esperava: ${stageEsperado}, Recebeu: ${flowStage}`);
      } else {
        console.log(`   ❌ DIVERGENTE_TEXTO (${timestamp?.toISOString()}) - Stage: ${flowStage}`);
        console.log(`      ${comparacao.diff}`);
      }
      
      // Atualizar stage atual para o próximo ciclo
      if (flowStage) {
        stageAtual = flowStage;
      }
      
      etapaNumero++;
      
      // Aguarda um pouco entre mensagens
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Parar se chegar a um stage final
      if (flowStage === 'ETAPA16_CONFIRMATION' || flowStage === 'STALE_RETURN') {
        console.log(`\n🏁 Chegou ao stage final: ${flowStage}`);
        break;
      }
    } catch (error) {
      console.log(`   ❌ ERRO: ${error}`);
      resultados.push({
        etapa: `#${etapaNumero}`,
        status: 'ERRO',
        esperado: inputEsperado,
        recebido: `ERRO: ${error}`,
        diff: `Erro ao enviar mensagem: ${error}`,
      });
      etapaNumero++;
      break; // Para em caso de erro
    }
  }

  // Testar regras cross-cutting separadamente - começa de estado conhecido
  console.log('\n\n🔬 Testando regras cross-cutting...\n');
  console.log('   Primeiro, resetando para estado conhecido (menu principal)...\n');
  
  // Resetar estado: limpar sessão e navegar até menu principal
  await prisma.whatsAppSession.deleteMany({ where: { phone: TEST_PHONE } });
  await prisma.whatsAppMessage.deleteMany({ where: { phone: TEST_PHONE } });
  
  // Navegar até menu principal
  await enviarMensagemTeste('Oi', 'setup-1');
  await new Promise(resolve => setTimeout(resolve, 500));
  await enviarMensagemTeste('João', 'setup-2');
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Agora estamos no menu principal (ETAPA2_MAIN_MENU)
  for (const [nome, teste] of Object.entries(testesCrossCutting)) {
    console.log(`\n📍 Testando: ${nome}`);
    console.log(`   Descrição: ${teste.descricao}`);
    console.log(`   Enviando: "${teste.mensagem}"`);
    
    try {
      const { resposta, timestamp, flowStage } = await enviarMensagemTeste(teste.mensagem, nome);
      
      // Para cross-cutting, esperamos que o menu seja reimpresso
      const textoEsperado = textosEsperadosPorStage[teste.etapa] || '';
      const comparacao = textoEsperado ? compararTexto(textoEsperado, resposta) : { ok: true };
      
      const resultado: TestResult = {
        etapa: nome,
        status: comparacao.ok ? 'OK' : 'DIVERGENTE_TEXTO',
        stageRecebido: flowStage,
        esperado: `Menu reimpresso (contém: ${textoEsperado.substring(0, 50)}...)`,
        recebido: resposta,
        timestamp,
        diff: comparacao.diff,
      };
      
      resultados.push(resultado);
      
      if (comparacao.ok) {
        console.log(`   ✅ OK (${timestamp?.toISOString()})`);
      } else {
        console.log(`   ❌ DIVERGENTE_TEXTO (${timestamp?.toISOString()})`);
        console.log(`      ${comparacao.diff}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`   ❌ ERRO: ${error}`);
      resultados.push({
        etapa: nome,
        status: 'ERRO',
        esperado: 'Menu reimpresso',
        recebido: `ERRO: ${error}`,
        diff: `Erro ao enviar mensagem: ${error}`,
      });
    }
  }

  // Calcular estatísticas
  const ok = resultados.filter(r => r.status === 'OK').length;
  const divergenteTexto = resultados.filter(r => r.status === 'DIVERGENTE_TEXTO').length;
  const desvioRota = resultados.filter(r => r.status === 'DESVIO_ROTA').length;
  const erros = resultados.filter(r => r.status === 'ERRO').length;
  const loopDetectado = resultados.filter(r => r.status === 'LOOP_DETECTADO').length;

  return {
    totalEtapas: resultados.length,
    ok,
    divergenteTexto,
    desvioRota,
    erros,
    loopDetectado,
    resultados,
  };
}

// Função para gerar dump bruto das mensagens do banco
async function gerarDumpMensagens(): Promise<string> {
  const mensagens = await prisma.whatsAppMessage.findMany({
    where: { phone: TEST_PHONE },
    orderBy: { createdAt: 'asc' },
  });

  let dump = '\n' + '='.repeat(80) + '\n';
  dump += 'DUMP BRUTO DAS MENSAGENS (BANCO DE DADOS)\n';
  dump += '='.repeat(80) + '\n\n';
  
  if (mensagens.length === 0) {
    dump += 'Nenhuma mensagem encontrada para o telefone de teste.\n';
  } else {
    dump += `Total de mensagens: ${mensagens.length}\n\n`;
    
    for (const msg of mensagens) {
      dump += `${msg.createdAt.toISOString()} | ${msg.direction} | ${msg.sender}\n`;
      dump += `Texto: ${msg.body}\n`;
      dump += `Stage: ${msg.flowStage}\n`;
      dump += '-'.repeat(80) + '\n';
    }
  }
  
  dump += '='.repeat(80) + '\n';
  
  return dump;
}

// Função para gerar relatório
function gerarRelatorio(report: TestReport): string {
  let relatorio = '\n' + '='.repeat(80) + '\n';
  relatorio += 'RELATÓRIO DE TESTE DO FLUXO COMPLETO (STATEFUL)\n';
  relatorio += '='.repeat(80) + '\n\n';
  
  relatorio += `Total de etapas testadas: ${report.totalEtapas}\n`;
  relatorio += `✅ OK: ${report.ok}\n`;
  relatorio += `⚠️ DESVIO DE ROTA: ${report.desvioRota}\n`;
  relatorio += `❌ DIVERGENTE_TEXTO: ${report.divergenteTexto}\n`;
  relatorio += `🔴 ERRO: ${report.erros}\n`;
  relatorio += `🔄 LOOP DETECTADO: ${report.loopDetectado}\n\n`;
  
  relatorio += '-'.repeat(80) + '\n';
  relatorio += 'DETALHAMENTO POR ETAPA\n';
  relatorio += '-'.repeat(80) + '\n\n';
  
  for (const resultado of report.resultados) {
    relatorio += `ETAPA: ${resultado.etapa}\n`;
    relatorio += `Status: ${resultado.status}\n`;
    
    if (resultado.stageEsperado || resultado.stageRecebido) {
      relatorio += `Stage esperado: ${resultado.stageEsperado || 'N/A'}\n`;
      relatorio += `Stage recebido: ${resultado.stageRecebido || 'N/A'}\n`;
    }
    
    relatorio += `Timestamp: ${resultado.timestamp?.toISOString() || 'N/A'}\n`;
    relatorio += `Esperado: ${resultado.esperado}\n`;
    relatorio += `Recebido: ${resultado.recebido}\n`;
    
    if (resultado.diff) {
      relatorio += `Diff:\n${resultado.diff}\n`;
    }
    
    relatorio += '\n';
  }
  
  relatorio += '='.repeat(80) + '\n';
  
  return relatorio;
}

// Executar teste
async function main() {
  try {
    console.log('🧹 Limpando dados de teste anteriores...');
    
    // Limpar sessão de teste anterior se existir
    await prisma.whatsAppSession.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    // Limpar mensagens de teste anteriores
    await prisma.whatsAppMessage.deleteMany({
      where: { phone: TEST_PHONE }
    });
    
    console.log('✅ Dados de teste anteriores limpos\n');
    
    const report = await executarTesteFluxo();
    
    // Gerar dump bruto das mensagens ANTES de limpar
    console.log('\n📊 Gerando dump bruto das mensagens...');
    const dumpMensagens = await gerarDumpMensagens();
    
    const relatorio = gerarRelatorio(report);
    const relatorioCompleto = relatorio + '\n\n' + dumpMensagens;
    
    console.log(relatorio);
    console.log(dumpMensagens);
    
    // Salvar relatório em arquivo
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `relatorio-teste-fluxo-${timestamp}.txt`;
    writeFileSync(filename, relatorioCompleto);
    console.log(`📄 Relatório salvo em: ${filename}`);
    
    console.log(`\n📊 Teste concluído!`);
    console.log(`✅ ${report.ok} etapas OK`);
    console.log(`⚠️ ${report.desvioRota} desvios de rota`);
    console.log(`❌ ${report.divergenteTexto} divergências de texto`);
    console.log(`🔴 ${report.erros} erros`);
    console.log(`🔄 ${report.loopDetectado} loops detectados`);
    
    // Limpar dados de teste após conclusão
    console.log('\n🧹 Limpando dados de teste...');
    await prisma.whatsAppSession.deleteMany({
      where: { phone: TEST_PHONE }
    });
    await prisma.whatsAppMessage.deleteMany({
      where: { phone: TEST_PHONE }
    });
    console.log('✅ Dados de teste limpos');
    
    await prisma.$disconnect();
    
    process.exit((report.divergenteTexto > 0 || report.desvioRota > 0 || report.erros > 0 || report.loopDetectado > 0) ? 1 : 0);
  } catch (error) {
    console.error('Erro ao executar teste:', error);
    
    // Tentar limpar dados mesmo em caso de erro
    try {
      await prisma.whatsAppSession.deleteMany({
        where: { phone: TEST_PHONE }
      });
      await prisma.whatsAppMessage.deleteMany({
        where: { phone: TEST_PHONE }
      });
    } catch (cleanupError) {
      console.error('Erro ao limpar dados de teste:', cleanupError);
    }
    
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  main();
}

export { executarTesteFluxo, gerarRelatorio };
