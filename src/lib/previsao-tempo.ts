/**
 * Previsão do tempo para o dia do atendimento.
 *
 * Lavagem e chuva brigam: o cliente marca a lavagem de sexta, chove no sábado e
 * a sensação é de dinheiro jogado fora — mesmo quando o serviço foi impecável.
 * Avisar antes transforma uma reclamação futura em uma escolha informada agora.
 *
 * Usa a Open-Meteo, que é aberta e não pede chave. Se a API não responder, o
 * atendimento segue sem o aviso: previsão é um extra, nunca um bloqueio.
 */

/** Jundiaí/SP. A loja é uma só; não vale a pena geocodificar a cada mensagem. */
const LATITUDE = -23.1857;
const LONGITUDE = -46.8978;
const TIMEOUT_MS = 2_500;

export interface PrevisaoDoDia {
  /** Chance máxima de chuva no período comercial, em %. */
  chanceDeChuva: number;
  tempMin: number;
  tempMax: number;
  /** Frase pronta para a mensagem, ou null quando o tempo não muda nada. */
  aviso: string | null;
}

/**
 * Chance de chuva alta o bastante para mencionar.
 *
 * Abaixo de 50% a menção só gera dúvida sem ajudar a decidir; acima disso, o
 * cliente merece saber antes de escolher o dia.
 */
const LIMITE_PARA_AVISAR = 50;

export async function preverODia(dataIso: string): Promise<PrevisaoDoDia | null> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
    `&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min` +
    `&timezone=America%2FSao_Paulo&start_date=${dataIso}&end_date=${dataIso}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(url, { signal: controller.signal });
    if (!resposta.ok) return null;

    const dados = (await resposta.json()) as {
      daily?: {
        precipitation_probability_max?: (number | null)[];
        temperature_2m_max?: (number | null)[];
        temperature_2m_min?: (number | null)[];
      };
    };

    const chance = dados.daily?.precipitation_probability_max?.[0];
    const max = dados.daily?.temperature_2m_max?.[0];
    const min = dados.daily?.temperature_2m_min?.[0];
    if (chance == null || max == null || min == null) return null;

    return {
      chanceDeChuva: Math.round(chance),
      tempMin: Math.round(min),
      tempMax: Math.round(max),
      aviso: montarAviso(Math.round(chance)),
    };
  } catch {
    // Rede instável ou API fora: seguir sem previsão é melhor que atrasar.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function montarAviso(chance: number): string | null {
  if (chance < LIMITE_PARA_AVISAR) return null;
  if (chance >= 80) {
    return `🌧️ A previsão para esse dia é de chuva (${chance}%). Se quiser, escolho outro — é só responder *remarcar*.`;
  }
  return `🌦️ Pode chover nesse dia (${chance}% de chance). O serviço acontece normalmente; se preferir outro dia, responda *remarcar*.`;
}
