/**
 * Marcadores curtos compartilhados entre as instâncias serverless.
 *
 * Uma trava em memória não sobrevive à invocação: na Vercel, cada mensagem pode
 * cair em um processo novo. O caso que motivou isto é o provedor de IA sem
 * crédito — ele respondia 402 em ~300ms para *toda* mensagem, porque o cooldown
 * descoberto por uma instância morria com ela.
 *
 * O cache em memória evita a ida ao banco dentro da mesma instância; o banco
 * carrega o estado entre elas.
 */
import { prisma } from "./prisma";

const memoria = new Map<string, { valor: string | null; expiraEm: number }>();
const TTL_MEMORIA_MS = 30_000;

/** Diz se o marcador está ativo agora. Erro de banco nunca bloqueia o fluxo. */
export async function flagAtiva(key: string): Promise<boolean> {
  const emMemoria = memoria.get(key);
  if (emMemoria && Date.now() < emMemoria.expiraEm) return emMemoria.valor !== null;

  try {
    const linha = await prisma.runtimeFlag.findUnique({
      where: { key },
      select: { value: true, expiresAt: true },
    });
    const ativa = Boolean(linha && (!linha.expiresAt || linha.expiresAt > new Date()));
    memoria.set(key, { valor: ativa ? linha!.value : null, expiraEm: Date.now() + TTL_MEMORIA_MS });
    return ativa;
  } catch {
    return false;
  }
}

/** Liga o marcador por um tempo. Falha de escrita só custa a próxima tentativa. */
export async function ligarFlag(key: string, value: string, duracaoMs: number): Promise<void> {
  const expiresAt = new Date(Date.now() + duracaoMs);
  memoria.set(key, { valor: value, expiraEm: Date.now() + TTL_MEMORIA_MS });
  try {
    await prisma.runtimeFlag.upsert({
      where: { key },
      create: { key, value, expiresAt },
      update: { value, expiresAt },
    });
  } catch (erro) {
    console.warn("[RuntimeFlag] Não foi possível persistir o marcador:", key, erro);
  }
}

/** Provedor de IA fora do ar ou sem crédito. */
export const FLAG_CEREBRAS_INDISPONIVEL = "ai:cerebras:indisponivel";
