import type { Settings } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Cache curto da linha única de `Settings`.
 *
 * Uma mensagem do WhatsApp lia essa mesma linha 3 ou 4 vezes — no `whatsapp-bot`,
 * na trava de destinatário do envio, no contexto do fluxo e no horário comercial.
 * Cada leitura é uma ida ao Postgres, e o webhook tem orçamento de segundos.
 * A janela é curta o bastante para uma mudança no painel valer quase de imediato.
 */
const TTL_MS = 5_000;
let cache: { valor: Settings | null; carregadoEm: number } | null = null;
let emVoo: Promise<Settings | null> | null = null;

export async function getRuntimeSettings(): Promise<Settings | null> {
  const agora = Date.now();
  if (cache && agora - cache.carregadoEm < TTL_MS) return cache.valor;
  // Chamadas simultâneas dentro da mesma invocação compartilham uma só consulta.
  if (emVoo) return emVoo;

  emVoo = prisma.settings
    .findUnique({ where: { id: "default" } })
    .then((valor) => {
      cache = { valor, carregadoEm: Date.now() };
      return valor;
    })
    .finally(() => {
      emVoo = null;
    });

  return emVoo;
}

/** Invalida o cache — chamar depois de gravar as configurações no painel. */
export function invalidateRuntimeSettings(): void {
  cache = null;
}

/**
 * Dias de funcionamento já em cache, para quem não pode esperar (`await`).
 *
 * O fluxo valida datas dentro de funções síncronas — `parseDayInput` é uma
 * delas — e por isso a regra estava escrita à mão como "fechado aos domingos".
 * Toda mensagem carrega as configurações antes de chegar ao fluxo, então o
 * cache está quente; quando não estiver, quem chama decide o padrão.
 */
export function getCachedWorkingDays(): number[] | null {
  if (!cache || Date.now() - cache.carregadoEm >= TTL_MS) return null;
  const bruto = cache.valor?.workingDays;
  if (!bruto) return null;
  const dias = bruto
    .split(",")
    .map((parte) => Number(parte.trim()))
    .filter((dia) => Number.isInteger(dia) && dia >= 0 && dia <= 6);
  return dias.length ? dias : null;
}

export async function getSessionResetMs(): Promise<number> {
  // Regra comercial fixa: toda conversa recomeça após uma hora sem interação.
  // O campo legado permanece no banco para compatibilidade com instalações antigas.
  return 60 * 60 * 1000;
}

export async function getFollowupIdleMs(): Promise<number> {
  const s = await getRuntimeSettings();
  return (s?.followupIdleMin ?? 10) * 60 * 1000;
}
