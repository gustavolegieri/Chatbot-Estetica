import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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
      whatsappWelcomeMsg:
        "Olá! Bem-vindo à Garagem do Ka 🚗 Estética automotiva premium.",
    },
  });

  const services = [
    {
      name: "Lavagem Completa",
      description: "Lavagem externa e interna com enceramento básico",
      price: 89.9,
      durationMin: 90,
    },
    {
      name: "Polimento",
      description: "Polimento profissional com remoção de riscos leves",
      price: 299.9,
      durationMin: 180,
    },
    {
      name: "Vitrificação",
      description: "Proteção cerâmica de alta durabilidade",
      price: 899.9,
      durationMin: 240,
    },
    {
      name: "Higienização Interna",
      description: "Limpeza profunda de estofados e carpetes",
      price: 199.9,
      durationMin: 120,
    },
    {
      name: "Detalhamento Completo",
      description: "Pacote completo: lavagem, polimento e proteção",
      price: 1299.9,
      durationMin: 360,
    },
    {
      name: "Cristalização",
      description: "Selagem com brilho intenso e proteção da pintura",
      price: 449.9,
      durationMin: 150,
    },
    {
      name: "Enceramento Premium",
      description: "Cera de alta performance e acabamento de vitrine",
      price: 179.9,
      durationMin: 60,
    },
    {
      name: "Revitalização de Plásticos",
      description: "Recuperação de plásticos externos e internos",
      price: 149.9,
      durationMin: 90,
    },
    {
      name: "Limpeza de Motor",
      description: "Limpeza técnica e segura do compartimento do motor",
      price: 199.9,
      durationMin: 90,
    },
  ];

  for (const service of services) {
    const existing = await prisma.service.findFirst({
      where: { name: service.name },
    });
    if (!existing) {
      await prisma.service.create({ data: service });
    }
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
