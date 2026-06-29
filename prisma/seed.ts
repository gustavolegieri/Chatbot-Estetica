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
    update: {},
    create: {
      id: "default",
      businessName: "Garagem do Ka",
      businessPhone: "(11) 99999-9999",
      businessAddress: "Rua das Oficinas, 100 - São Paulo, SP",
      lunchBreakStart: "12:00",
      lunchBreakEnd: "13:00",
      whatsappWelcomeMsg: "Olá! Bem-vindo à Garagem do Ka 🚗 Estética automotiva premium.",
    },
  });

  await seedBotPrompts();

  const serviceIds: Record<string, string> = {};

  for (const [key, item] of Object.entries(CATALOG)) {
    if (key === "indeciso") continue;

    const existing = await prisma.service.findFirst({ where: { catalogKey: key } });
    const basePrice = item.hatchMin > 0 ? item.hatchMin : 99.9;

    const data = {
      name: item.label,
      description: item.short,
      price: basePrice,
      durationMin: 120,
      active: true,
      catalogKey: key,
      categoryNum: categoryForKey(key),
      menuOrder: 0,
      whatsappPitch: item.pitch,
      whatsappShort: item.short,
      priceHatchMin: item.hatchMin,
      priceHatchMax: item.hatchMax,
      priceSuvMin: item.suvMin,
      priceSuvMax: item.suvMax,
      timeEstimate: item.time,
      showInWhatsApp: true,
    };

    if (existing) {
      const updated = await prisma.service.update({ where: { id: existing.id }, data });
      serviceIds[key] = updated.id;
    } else {
      const created = await prisma.service.create({ data });
      serviceIds[key] = created.id;
    }
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
