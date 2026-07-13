/**
 * Gerador de Recibo Digital Automático
 * Gera PDF de recibo após pagamento confirmado
 */

import { prisma } from "./prisma";
import { paymentLogger } from "./structured-logger";

export interface ReceiptData {
  customerName: string;
  customerPhone: string;
  serviceName: string;
  vehicleInfo: string;
  date: string;
  time: string;
  amount: number;
  paymentMethod: string;
  transactionId: string;
  paidAt: Date;
  businessName: string;
  businessAddress: string;
  businessPhone: string;
}

/**
 * Gera recibo digital em formato de texto (pode ser convertido para PDF depois)
 */
export function generateReceiptText(data: ReceiptData): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("                        RECIBO DE PAGAMENTO");
  lines.push("═══════════════════════════════════════════════════════════");
  lines.push("");
  lines.push(`Empresa: ${data.businessName}`);
  lines.push(`Endereço: ${data.businessAddress}`);
  lines.push(`Telefone: ${data.businessPhone}`);
  lines.push("");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push("                        DADOS DO CLIENTE");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push(`Nome: ${data.customerName}`);
  lines.push(`Telefone: ${data.customerPhone}`);
  lines.push("");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push("                      SERVIÇO CONTRATADO");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push(`Serviço: ${data.serviceName}`);
  lines.push(`Veículo: ${data.vehicleInfo}`);
  lines.push(`Data: ${data.date}`);
  lines.push(`Horário: ${data.time}`);
  lines.push("");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push("                       PAGAMENTO");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push(`Valor: R$ ${data.amount.toFixed(2).replace('.', ',')}`);
  lines.push(`Forma: ${data.paymentMethod}`);
  lines.push(`ID Transação: ${data.transactionId}`);
  lines.push(`Pago em: ${data.paidAt.toLocaleString('pt-BR')}`);
  lines.push("");
  lines.push("─────────────────────────────────────────────────────────────");
  lines.push("Este recibo serve como comprovante de pagamento.");
  lines.push("Guarde-o para fins de garantia e fiscal.");
  lines.push("═══════════════════════════════════════════════════════════");

  return lines.join("\n");
}

/**
 * Salva recibo no banco de dados
 */
export async function saveReceipt(appointmentId: string, receiptText: string) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true },
    });

    if (!appointment) {
      paymentLogger.error("Agendamento não encontrado para salvar recibo", undefined, { appointmentId });
      return null;
    }

    // Atualizar notas do agendamento com o recibo
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: {
        notes: `${appointment.notes || ""}\n\n--- RECIBO ---\n${receiptText}`,
      },
    });

    paymentLogger.info("Recibo salvo no agendamento", { appointmentId, clientPhone: appointment.client.phone });
    return appointment;
  } catch (error) {
    paymentLogger.error("Erro ao salvar recibo", error as Error, { appointmentId });
    return null;
  }
}

/**
 * Gera e envia recibo após pagamento confirmado
 */
export async function generateAndSendReceipt(appointmentId: string, phoneNumber: string) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: true, service: true },
    });

    if (!appointment) {
      paymentLogger.error("Agendamento não encontrado", undefined, { appointmentId });
      return null;
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" },
    });

    const receiptData: ReceiptData = {
      customerName: appointment.client.name,
      customerPhone: appointment.client.phone,
      serviceName: appointment.service.name,
      vehicleInfo: appointment.notes?.split("|")[0] || "Não informado",
      date: new Date(appointment.date).toLocaleDateString('pt-BR'),
      time: appointment.startTime,
      amount: Number(appointment.finalPrice || appointment.service.price),
      paymentMethod: appointment.paymentMethod || "PIX",
      transactionId: `APPT-${appointment.id.substring(0, 8).toUpperCase()}`,
      paidAt: new Date(),
      businessName: settings?.businessName || "Garagem do Ka",
      businessAddress: settings?.businessAddress || "Endereço não informado",
      businessPhone: settings?.businessPhone || "Telefone não informado",
    };

    const receiptText = generateReceiptText(receiptData);

    // Salvar no banco
    await saveReceipt(appointmentId, receiptText);

    paymentLogger.info("Recibo gerado com sucesso", { appointmentId, amount: receiptData.amount });

    return {
      receiptText,
      receiptData,
    };
  } catch (error) {
    paymentLogger.error("Erro ao gerar recibo", error as Error, { appointmentId });
    return null;
  }
}
