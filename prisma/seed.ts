import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATALOG, CATEGORIES, UPSELL_BY_KEY } from "../src/lib/whatsapp-catalog";
import { seedBotPrompts } from "../src/lib/bot-prompts";

const prisma = new PrismaClient();

function categoryForKey(key: string): number {
  for (const [num, cat] of Object.entries(CATEGORIES)) {
    if (cat.keys.includes(key)) return Number(num);
  }
  return 1;
}

function menuOrderForKey(key: string): number {
  for (const cat of Object.values(CATEGORIES)) {
    const idx = cat.keys.indexOf(key);
    if (idx >= 0) return idx + 1;
  }
  return 0;
}

const durationByKey: Record<string, number> = {
  lavagem_simples: 60,
  lavagem_completa: 90,
  lavagem_detalhada: 120,
  limpeza_motor: 60,
  cristalizacao_farois: 90,
  descontaminacao_pintura: 60,
  descontaminacao_vidro: 60,
  higienizacao_tecido: 90,
  higienizacao_couro: 90,
  higienizacao_tecido_completa: 150,
  higienizacao_couro_completa: 150,
  polimento_cotacao: 240,
  revitalizacao_pintura: 360,
  descontaminacao: 150,
  limpeza_premium: 180,
  pacotes: 480,
  indeciso: 0,
};

function durationForKey(key: string): number {
  return durationByKey[key] ?? 120;
}

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  await prisma.user.upsert({
    where: { email: "admin@estetica.com" },
    update: { password: passwordHash, active: true, role: UserRole.ADMIN },
    create: {
      email: "admin@estetica.com",
      name: "Administrador",
      password: passwordHash,
      role: UserRole.ADMIN,
    },
  });

  await prisma.settings.upsert({
    where: { id: "default" },
    update: {
      businessName: "Garagem do Ka",
      businessPhone: "(11) 99999-9999",
      businessAddress: "Rua das Oficinas, 100 - São Paulo, SP",
      businessHoursStart: "08:00",
      businessHoursEnd: "18:00",
      slotDurationMin: 30,
      workingDays: "1,2,3,4,5,6",
      lunchBreakStart: "12:00",
      lunchBreakEnd: "13:00",
      sessionResetMin: 30,
      whatsappWelcomeMsg: "Olá! Bem-vindo à Garagem do Ka 🚗 Estética automotiva premium.",
    },
    create: {
      id: "default",
      businessName: "Garagem do Ka",
      businessPhone: "(11) 99999-9999",
      businessAddress: "Rua das Oficinas, 100 - São Paulo, SP",
      businessHoursStart: "08:00",
      businessHoursEnd: "18:00",
      slotDurationMin: 30,
      workingDays: "1,2,3,4,5,6",
      lunchBreakStart: "12:00",
      lunchBreakEnd: "13:00",
      sessionResetMin: 30,
      whatsappWelcomeMsg: "Olá! Bem-vindo à Garagem do Ka 🚗 Estética automotiva premium.",
    },
  });

  await seedBotPrompts();

  // Criar cupom de primeira vez
  await prisma.coupon.upsert({
    where: { code: "PRIMEIRA10" },
    update: {},
    create: {
      code: "PRIMEIRA10",
      type: "percent",
      amount: 10,
      validFrom: new Date(),
      validTo: new Date("2030-12-31"),
      usageLimit: 999999,
      usagePerCustomer: 1,
      active: true,
    },
  });

  const validKeys = new Set(Object.keys(CATALOG).filter((k) => k !== "indeciso"));
  await prisma.service.updateMany({
    where: {
      catalogKey: { not: null },
      NOT: { catalogKey: { in: [...validKeys] } },
    },
    data: { active: false, showInWhatsApp: false },
  });

  const serviceIds: Record<string, string> = {};

  for (const [key, item] of Object.entries(CATALOG)) {
    if (key === "indeciso") continue;

    const basePrice = item.hatchMin > 0 ? item.hatchMin : 0;
    const data = {
      name: item.label,
      description: item.short,
      price: basePrice > 0 ? basePrice : 0,
      durationMin: durationForKey(key),
      active: true,
      catalogKey: key,
      categoryNum: categoryForKey(key),
      menuOrder: menuOrderForKey(key),
      whatsappPitch: item.pitch,
      whatsappShort: item.short,
      priceHatchMin: item.hatchMin,
      priceHatchMax: item.hatchMax,
      priceSuvMin: item.suvMin,
      priceSuvMax: item.suvMax,
      timeEstimate: item.time,
      showInWhatsApp: true,
    };

    const upserted = await prisma.service.upsert({
      where: { catalogKey: key },
      update: data,
      create: data,
    });
    serviceIds[key] = upserted.id;
  }

  for (const [key, upsell] of Object.entries(UPSELL_BY_KEY)) {
    const serviceId = serviceIds[key];
    if (!serviceId) continue;
    const complement = Object.entries(CATALOG).find(([, v]) => v.label === upsell.complement);
    const upsellId = complement ? serviceIds[complement[0]] : undefined;
    if (!upsellId) continue;
    await prisma.service.update({
      where: { id: serviceId },
      data: { upsellServiceId: upsellId, upsellBenefit: upsell.benefit },
    });
  }

  console.log("Seed concluído!");
  console.log("Login: admin@estetica.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
