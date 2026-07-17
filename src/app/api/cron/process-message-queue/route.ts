import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { wasenderFetch } from "@/lib/evolution-api";
import crypto from "crypto";

/**
 * Verifica se erros são recuperáveis (devem enfileirar para retry)
 */
function isRecoverableError(statusCode: number, errorMessage?: string): boolean {
  // Erros 5xx são recuperáveis (problemas no servidor)
  if (statusCode >= 500 && statusCode < 600) return true;
  
  // Timeout de rede é recuperável
  if (errorMessage?.toLowerCase().includes('timeout')) return true;
  if (errorMessage?.toLowerCase().includes('etimedout')) return true;
  if (errorMessage?.toLowerCase().includes('network')) return true;
  
  // Erros 429 (rate limit) são recuperáveis se não for limite diário
  if (statusCode === 429) {
    // Limite diário não é recuperável (já tratado no evolution-api.ts)
    if (errorMessage?.toLowerCase().includes('daily')) return false;
    if (errorMessage?.toLowerCase().includes('trial cap')) return false;
    return true; // Rate limit temporário é recuperável
  }
  
  // Erros 4xx (exceto 429) não são recuperáveis (erro do cliente)
  return false;
}

/**
 * Rota para processar fila de mensagens pendentes (rate-limit).
 * Chamada periodicamente por serviço externo de cron (cron-job.org) para garantir
 * que mensagens enfileiradas por rate limit sejam enviadas mesmo em ambiente serverless.
 * 
 * NOTA: Vercel Hobby limita cron jobs a 1x/dia, então usamos cron externo.
 * 
 * Endpoint: /api/cron/process-message-queue
 * Método: POST
 * Autenticação: Bearer token via CRON_SECRET (OBRIGATÓRIO)
 * 
 * Exemplo de chamada:
 * curl -X POST https://chatbot-estetica-ten.vercel.app/api/cron/process-message-queue \
 *   -H "Authorization: Bearer SEU_CRON_SECRET"
 */
export async function POST(req: NextRequest) {
  try {
    // Verificar autenticação (OBRIGATÓRIO para cron externo)
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    
    if (!cronSecret) {
      console.error("[Cron] CRON_SECRET não configurado no ambiente");
      return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
    }
    
    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[Cron] Autenticação inválida ou ausente");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Iniciando processamento da fila de mensagens");
    
    // Gerar UUID único para esta execução (lock distribuído)
    const executionId = crypto.randomUUID();
    console.log(`[Cron] Execution ID: ${executionId}`);
    
    const now = new Date();
    
    // CLAIM ATÔMICO: Usar updateMany com UUID para "reivindicar" mensagens pendentes
    // Isso evita race condition quando múltiplas execuções do cron rodam simultaneamente
    const claimResult = await prisma.outboundMessageQueue.updateMany({
      where: {
        processedAt: null,
        claimedBy: null, // Apenas mensagens não claimadas
        scheduledFor: { lte: now },
        isDailyLimit: false,
        attempts: { lt: 3 }
      },
      data: {
        claimedBy: executionId // Marcar com nosso UUID
      }
    });
    
    if (claimResult.count === 0) {
      console.log("[Cron] Nenhuma mensagem pendente para processar (ou outra instância já reclamou)");
      return NextResponse.json({ 
        ok: true, 
        processed: 0, 
        message: "Nenhuma mensagem pendente" 
      });
    }
    
    console.log(`[Cron] ✅ Claimed ${claimResult.count} mensagens para processamento`);
    
    // Buscar EXATAMENTE as mensagens que esta execução claimou (com nosso UUID)
    const pendingMessages = await prisma.outboundMessageQueue.findMany({
      where: {
        processedAt: null,
        claimedBy: executionId, // Apenas mensagens claimadas por esta execução
        isDailyLimit: false,
        attempts: { lt: 3 }
      },
      orderBy: { scheduledFor: 'asc' },
      take: 50
    });
    
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const msg of pendingMessages) {
      try {
        console.log(`[Cron] Processando mensagem ${msg.id} (tentativa ${msg.attempts + 1}/${msg.maxAttempts})`);
        
        // Converter o JSON de volta para objeto para enviar à API
        const body = typeof msg.body === 'string' ? JSON.parse(msg.body) : msg.body;
        const result = await wasenderFetch(body);
        
        // Marcar como processada e limpar claimedBy
        await prisma.outboundMessageQueue.update({
          where: { id: msg.id },
          data: { 
            processedAt: now,
            claimedBy: null // Limpar o lock
          }
        });
        
        console.log(`[Cron] ✅ Mensagem ${msg.id} enviada com sucesso`);
        processed++;
        
        // Verificar se o resultado indica limite diário
        if (result && typeof result === 'object' && 'error' in result && (result as any).isDailyLimit) {
          console.error("[Cron] ❌ Limite diário atingido - interrompendo processamento");
          // Marcar mensagens restantes como limite diário
          await prisma.outboundMessageQueue.updateMany({
            where: {
              processedAt: null,
              phone: msg.phone
            },
            data: { isDailyLimit: true }
          });
          break;
        }
        
      } catch (err) {
        console.error(`[Cron] ❌ Erro ao processar mensagem ${msg.id}:`, err);
        
        // Verificar se o erro é recuperável
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isRecoverable = isRecoverableError(500, errorMessage); // Default to 500 for unknown errors
        
        if (!isRecoverable) {
          console.warn(`[Cron] ⚠️ Erro não recuperável para mensagem ${msg.id}, descartando:`, errorMessage);
          // Marcar como processada com erro para não tentar novamente
          await prisma.outboundMessageQueue.update({
            where: { id: msg.id },
            data: {
              processedAt: now,
              claimedBy: null, // Limpar o lock
              error: `Erro não recuperável: ${errorMessage}`
            }
          });
          skipped++;
          continue;
        }
        
        // Incrementar tentativas e reagendar se não excedeu o máximo
        if (msg.attempts < msg.maxAttempts) {
          const nextAttempt = new Date(Date.now() + 35000); // 35 segundos no futuro
          await prisma.outboundMessageQueue.update({
            where: { id: msg.id },
            data: {
              attempts: msg.attempts + 1,
              scheduledFor: nextAttempt,
              claimedBy: null, // Limpar o lock para permitir retry
              error: errorMessage
            }
          });
          console.log(`[Cron] 🔄 Mensagem ${msg.id} readicionada à fila (tentativa ${msg.attempts + 1}, agendada para ${nextAttempt})`);
          failed++;
        } else {
          // Marcar como processada com erro para não tentar novamente
          await prisma.outboundMessageQueue.update({
            where: { id: msg.id },
            data: {
              processedAt: now,
              claimedBy: null, // Limpar o lock
              error: `Máximo de tentativas atingido: ${errorMessage}`
            }
          });
          console.warn(`[Cron] ⚠️ Mensagem ${msg.id} descartada após ${msg.maxAttempts} tentativas`);
          skipped++;
        }
      }
    }
    
    // Limpar mensagens antigas processadas (mais de 24h)
    const cleanupResult = await prisma.outboundMessageQueue.deleteMany({
      where: {
        processedAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 horas atrás
        }
      }
    });
    
    console.log(`[Cron] 🧹 Limpeza: ${cleanupResult.count} mensagens antigas removidas`);
    
    console.log(`[Cron] ✅ Processamento concluído: ${processed} enviadas, ${failed} falharam, ${skipped} descartadas`);
    
    return NextResponse.json({ 
      ok: true, 
      processed, 
      failed, 
      skipped,
      cleaned: cleanupResult.count,
      message: "Processamento concluído" 
    });
    
  } catch (error) {
    console.error("[Cron/ProcessMessageQueue] Erro não tratado, processo NÃO deve cair:", error);
    return NextResponse.json({ success: false, error: String(error) }, { status: 200 });
  }
}

// Também aceita GET para testes manuais
export async function GET(req: NextRequest) {
  return POST(req);
}
