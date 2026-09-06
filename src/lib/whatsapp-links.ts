/**
 * Links úteis que o WhatsApp transforma em ação com um toque.
 *
 * São integrações que não custam chave nem servidor: o Google Maps e o Google
 * Agenda aceitam a intenção pela própria URL. O cliente sai da conversa com a
 * rota traçada e o compromisso salvo no celular dele — coisas que antes ele
 * teria de copiar à mão do texto da confirmação.
 */
import { format } from "date-fns";

/** Rota até a loja, no app de mapas do próprio aparelho. */
export function rotaNoMapa(endereco: string): string | null {
  const limpo = endereco?.trim();
  if (!limpo) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(limpo)}`;
}

/**
 * Evento no Google Agenda com horário de início e fim.
 *
 * As datas vão em UTC no formato compacto que a URL espera. O fuso de São Paulo
 * é fixo em -3 desde 2019 (sem horário de verão), então a conversão é direta.
 */
export function eventoNaAgenda(params: {
  titulo: string;
  inicio: Date;
  duracaoMin: number;
  local: string;
  detalhes?: string;
}): string {
  const paraUtc = (data: Date) => {
    const utc = new Date(data.getTime() + 3 * 60 * 60_000);
    return `${format(utc, "yyyyMMdd")}T${format(utc, "HHmmss")}Z`;
  };
  const fim = new Date(params.inicio.getTime() + params.duracaoMin * 60_000);

  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: params.titulo,
    dates: `${paraUtc(params.inicio)}/${paraUtc(fim)}`,
    location: params.local,
  });
  if (params.detalhes) query.set("details", params.detalhes);

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/**
 * Quando o serviço pede repetição.
 *
 * O intervalo sai do cadastro quando existe; senão, do tipo de serviço. Serve
 * para a confirmação já dizer "te chamo em novembro" em vez de deixar o próximo
 * atendimento por conta da memória do cliente.
 */
export function proximaManutencao(inicio: Date, dias: number | null | undefined): string | null {
  if (!dias || dias <= 0) return null;
  const alvo = new Date(inicio.getTime() + dias * 24 * 60 * 60_000);
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${meses[alvo.getMonth()]} de ${alvo.getFullYear()}`;
}
