/**
 * Sistema de Recuperação de Agendamentos Abandonados
 * Envia mensagens para clientes que abandonaram o fluxo
 */

import { prisma } from "./prisma";
import { sendText } from "./evolution-api";
import { findAbandonedSessions } from "./funnel-tracker";
import { botLogger } from "./structured-logger";

export interface AbandonmentMessage {
  sessionId: string;
  phone: string;
  customerName: string;
  abandonmentStage: string;
  abandonmentReason: string;
  abandonmentAt: Date;
}

/**
 * Envia mensagem de recuperação para sessões abandonadas
 */
export async function sendAbandonmentRecoveryMessage(phone: string, customerName: string, stage: string) {
  try {
    let message = "";

    switch (stage) {
      case "ETAPA1_AWAITING_NAME":
        message = `Olá ${customerName}! 👋\n\nVi que você começou a agendar um serviço conosco, mas não completou.\n\nFaltou só informar seu nome para continuarmos.\n\nQuer tentar novamente?`;
        break;

      case "ETAPA2_MAIN_MENU":
        message = `Olá ${customerName}! 👋\n\nVocê estava escolhendo um serviço, mas não completou.\n\nVamos selecionar o serviço ideal para você?\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA3_SERVICE_SELECTION":
        message = `Olá ${customerName}! 👋\n\nVocê estava escolhendo um serviço específico.\n\nVamos ver as opções disponíveis?\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA4_VEHICLE_INFO":
        message = `Olá ${customerName}! 👋\n\nVocê estava informando os dados do seu veículo.\n\nFaltou só completar essa etapa.\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA5_QUOTE":
        message = `Olá ${customerName}! 👋\n\nVocê estava vendo o orçamento do serviço.\n\nQuer saber o valor final?\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA7_SCHEDULING":
        message = `Olá ${customerName}! 👋\n\nVocê estava escolhendo um horário para o serviço.\n\nVamos selecionar o melhor horário para você?\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA8_PAYMENT":
        message = `Olá ${customerName}! 👋\n\nVocê estava escolhendo a forma de pagamento.\n\nFaltou só confirmar o pagamento.\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      case "ETAPA8_RECEIPT_UPLOAD":
        message = `Olá ${customerName}! 👋\n\nVocê enviou o comprovante de pagamento, mas não confirmamos.\n\nVamos verificar e finalizar seu agendamento?\n\nResponda "Sim" para continuar ou "Não" para cancelar.`;
        break;

      default:
        message = `Olá ${customerName}! 👋\n\nVocê iniciou um agendamento conosco, mas não completou.\n\nQuer tentar novamente?\n\nResponda "Sim" para reiniciar ou "Não" para cancelar.`;
    }

    await sendText({ number: phone, text: message, skipBotLog: true });

    botLogger.info("Mensagem de recuperação enviada", { phone, customerName, stage });

    return { success: true };
  } catch (error) {
    botLogger.error("Erro ao enviar mensagem de recuperação", error as Error, { phone, customerName, stage });
    return { success: false };
  }
}

/**
 * Processa sessões abandonadas em lote
 */
export async function processAbandonedSessions() {
  try {
    const abandoned = await findAbandonedSessions(2); // 2 horas de threshold

    botLogger.info(`Processando ${abandoned.length} sessões abandonadas`);

    let sent = 0;
    for (const session of abandoned) {
      const customerName = session.client?.name || "Cliente";
      const stage = session.abandonmentStage || "UNKNOWN";

      const result = await sendAbandonmentRecoveryMessage(
        session.phone,
        customerName,
        stage
      );

      if (result.success) {
        sent++;
      }
    }

    botLogger.info(`Recuperação de abandono concluída`, { total: abandoned.length, sent });

    return { total: abandoned.length, sent };
  } catch (error) {
    botLogger.error("Erro ao processar sessões abandonadas", error as Error);
    return { total: 0, sent: 0 };
  }
}
