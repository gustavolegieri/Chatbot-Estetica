import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { wasenderFetch } from "@/lib/evolution-api";

/**
 * Rota para processar fila de mensagens pendentes (rate-limit).
 * Chamada periodicamente pelo Vercel Cron para garantir que mensagens
 * enfileiradas por rate limit sejam enviadas mesmo em ambiente serverless.
 * 
 * Endpoint: /api/cron/process-message-queue
 * Método: POST
 * Autenticação: Bearer token via CRON_SECRET (opcional, recomendado em produção)
 */
export async function POST(req: NextRequest) {
  // Verificar autenticação (opcional mas recomendado)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  
  if (cronSecret && (!authHeader || authHeader !== `Bearer ${cronSecret}`)) {
    console.warn("[Cron] Autenticação inválida");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Iniciando processamento da fila de mensagens");
    
    const now = new Date();
    
    // Buscar mensagens pendentes que já estão agendadas
    const pendingMessages = await prisma.outboundMessageQueue.findMany({
      where: {
        processedAt: null,
        scheduledFor: { lte: now },
        isDailyLimit: false, // Não processar mensagens marcadas como limite diário
        attempts: { lt: 3 }
      },
      orderBy: { scheduledFor: 'asc' },
      take: 50 // Limitar a 50 mensagens por execução para evitar timeout
    });
    
    if (pendingMessages.length === 0) {
      console.log("[Cron] Nenhuma mensagem pendente para processar");
      return NextResponse.json({ 
        ok: true, 
        processed: 0, 
        message: "Nenhuma mensagem pendente" 
      });
    }
    
    console.log(`[Cron] Processando ${pendingMessages.length} mensagens pendentes`);
    
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    
    for (const msg of pendingMessages) {
      try {
        console.log(`[Cron] Processando mensagem ${msg.id} (tentativa ${msg.attempts + 1}/${msg.maxAttempts})`);
        
        const result = await wasenderFetch(msg.body as any);
        
        // Marcar como processada
        await prisma.outboundMessageQueue.update({
          where: { id: msg.id },
          data: { processedAt: now }
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
        
        // Incrementar tentativas e reagendar se não excedeu o máximo
        if (msg.attempts < msg.maxAttempts) {
          const nextAttempt = new Date(Date.now() + 35000); // 35 segundos no futuro
          await prisma.outboundMessageQueue.update({
            where: { id: msg.id },
            data: {
              attempts: msg.attempts + 1,
              scheduledFor: nextAttempt,
              error: err instanceof Error ? err.message : 'Erro desconhecido'
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
              error: err instanceof Error ? err.message : 'Máximo de tentativas atingido'
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
    console.error("[Cron] ❌ Erro ao processar fila:", error);
    return NextResponse.json({ 
      error: "Erro ao processar fila", 
      details: error instanceof Error ? error.message : "Erro desconhecido" 
    }, { status: 500 });
  }
}

// Também aceita GET para testes manuais
export async function GET(req: NextRequest) {
  return POST(req);
}
