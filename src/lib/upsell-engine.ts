import { prisma } from "./prisma";

export interface UpsellSuggestion {
  serviceId: string;
  serviceName: string;
  price: number;
  originalPrice: number;
  discount: number;
  discountPercentage: number;
  benefit: string;
  reason: string;
}

export interface VehicleType {
  type: "hatchback" | "sedan" | "suv" | "pickup" | "unknown";
  confidence: number;
}

/**
 * Detecta o tipo de veículo baseado no nome/modelo informado
 */
export function detectVehicleType(vehicleName: string): VehicleType {
  const lower = vehicleName.toLowerCase();

  // Hatchback patterns
  if (lower.includes("hatch") || lower.includes("gol") || lower.includes("onix") ||
      lower.includes("hb20") || lower.includes("fit") || lower.includes("yaris") ||
      lower.includes("uno") || lower.includes("mobi") || lower.includes("kwid")) {
    return { type: "hatchback", confidence: 0.9 };
  }

  // SUV patterns
  if (lower.includes("suv") || lower.includes("compass") || lower.includes("t-cross") ||
      lower.includes("taos") || lower.includes("creta") || lower.includes("tucson") ||
      lower.includes("hr-v") || lower.includes("corolla cross") || lower.includes("wrangler")) {
    return { type: "suv", confidence: 0.9 };
  }

  // Pickup patterns
  if (lower.includes("pickup") || lower.includes("s10") || lower.includes("ranger") ||
      lower.includes("hilux") || lower.includes("l200") || lower.includes("montana") ||
      lower.includes("saveiro") || lower.includes("strada")) {
    return { type: "pickup", confidence: 0.95 };
  }

  // Sedan patterns (default for most cars)
  if (lower.includes("sedan") || lower.includes("civic") || lower.includes("corolla") ||
      lower.includes("jetta") || lower.includes("virtus") || lower.includes("logan") ||
      lower.includes("prisma") || lower.includes("cruze") || lower.includes("sonata")) {
    return { type: "sedan", confidence: 0.85 };
  }

  return { type: "unknown", confidence: 0.5 };
}

/**
 * Gera sugestões de upsell baseadas no tipo de veículo e serviço selecionado
 */
export async function generateUpsellSuggestions(
  selectedServiceId: string,
  vehicleType: VehicleType
): Promise<UpsellSuggestion[]> {
  const suggestions: UpsellSuggestion[] = [];

  // Buscar serviços configurados como upsell para este tipo de veículo
  const upsellServices = await prisma.service.findMany({
    where: {
      active: true,
      showInWhatsApp: true,
      NOT: { id: selectedServiceId },
      OR: vehicleType.type === "hatchback" ? [{ upsellForHatchback: true }]
          : vehicleType.type === "sedan" ? [{ upsellForSedan: true }]
          : vehicleType.type === "suv" ? [{ upsellForSuv: true }]
          : vehicleType.type === "pickup" ? [{ upsellForPickup: true }]
          : [{ upsellForHatchback: true }, { upsellForSedan: true }, { upsellForSuv: true }, { upsellForPickup: true }],
    },
    include: {
      upsellService: true,
    },
  });

  const selectedService = await prisma.service.findUnique({
    where: { id: selectedServiceId },
  });

  if (!selectedService) return suggestions;

  for (const service of upsellServices) {
    if (!service.upsellService) continue;

    const upsellService = service.upsellService;
    const discount = service.upsellDiscount ? Number(service.upsellDiscount) : 0;
    const originalPrice = Number(upsellService.price);
    const finalPrice = Math.max(0, originalPrice - discount);
    const discountPercentage = originalPrice > 0 ? (discount / originalPrice) * 100 : 0;

    // Gerar motivo personalizado baseado no tipo de veículo
    let reason = "";
    switch (vehicleType.type) {
      case "hatchback":
        reason = "Para hatchbacks, este serviço complementa perfeitamente o detalhamento.";
        break;
      case "suv":
        reason = "SUVs requerem proteção extra devido ao tamanho do veículo.";
        break;
      case "pickup":
        reason = "Pickups estão mais expostas às intempéries, essa proteção é essencial.";
        break;
      case "sedan":
        reason = "Este serviço adiciona valor e proteção ao seu sedan.";
        break;
      default:
        reason = "Recomendamos este serviço para complementar o agendamento.";
    }

    suggestions.push({
      serviceId: upsellService.id,
      serviceName: upsellService.name,
      price: finalPrice,
      originalPrice,
      discount,
      discountPercentage,
      benefit: service.upsellBenefit || "Melhora a durabilidade e aparência do veículo",
      reason,
    });
  }

  // Limitar a 3 sugestões
  return suggestions.slice(0, 3);
}

/**
 * Formata mensagem de upsell para o cliente
 */
export function formatUpsellMessage(
  suggestions: UpsellSuggestion[],
  vehicleName: string
): string {
  if (suggestions.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("✨ *Sugestões para seu " + vehicleName + "*");
  lines.push("");

  suggestions.forEach((s, i) => {
    lines.push(`${i + 1}. *${s.serviceName}*`);
    lines.push(`   ${s.reason}`);
    lines.push(`   💰 R$ ${s.price.toFixed(2).replace('.', ',')} ${s.discount > 0 ? `(era R$ ${s.originalPrice.toFixed(2).replace('.', ',')})` : ""}`);
    lines.push(`   ✨ ${s.benefit}`);
    lines.push("");
  });

  lines.push("Adicione um desses serviços ao seu agendamento?");
  lines.push("Responda com o número da opção desejada.");

  return lines.join("\n");
}

/**
 * Calcula pacote com desconto ao combinar serviços
 */
export function calculatePackageDiscount(
  baseServicePrice: number,
  upsellServicePrice: number,
  upsellDiscount: number
): {
  totalPrice: number;
  savings: number;
  savingsPercentage: number;
} {
  const originalTotal = baseServicePrice + upsellServicePrice;
  const finalTotal = baseServicePrice + Math.max(0, upsellServicePrice - upsellDiscount);
  const savings = originalTotal - finalTotal;
  const savingsPercentage = originalTotal > 0 ? (savings / originalTotal) * 100 : 0;

  return {
    totalPrice: finalTotal,
    savings,
    savingsPercentage,
  };
}
