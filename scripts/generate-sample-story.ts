import fs from "fs";
import path from "path";
import { composeStoryJpeg, type StorySlot } from "../src/lib/instagram-story";
import type { StoryLayoutId } from "../src/lib/instagram-story-tokens";
import { STORY_TOKENS } from "../src/lib/instagram-story-tokens";

const outputDir = path.join(process.cwd(), "public", "story-examples");
fs.mkdirSync(outputDir, { recursive: true });

const logoPath = path.join(process.cwd(), "public", "logo-garagem-do-ka.png");
const logoDataUrl = fs.existsSync(logoPath)
  ? `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`
  : null;

async function generate(input: {
  slot: StorySlot;
  layout: StoryLayoutId;
  eyebrow: string;
  title: string;
  subtitle: string;
  footer: string;
  price?: string;
  background: string;
  output: string;
}) {
  const background = fs.readFileSync(path.join(process.cwd(), "public", input.background));
  const mime = input.background.endsWith(".png") ? "image/png" : "image/jpeg";
  const jpeg = await composeStoryJpeg({
    slot: input.slot,
    layout: input.layout,
    brand: "Garagem do Ka",
    eyebrow: input.eyebrow,
    title: input.title,
    subtitle: input.subtitle,
    footer: input.footer,
    accent: STORY_TOKENS.color.brand,
    priceLabel: input.price || null,
    bgDataUrl: `data:${mime};base64,${background.toString("base64")}`,
    logoDataUrl,
    bgSeed: input.output,
    cropPosition: "centre",
  });
  fs.writeFileSync(path.join(outputDir, input.output), jpeg);
}

async function main() {
  await generate({
    slot: "manha",
    layout: "bottom",
    eyebrow: "Você sabia?",
    title: "O sol também envelhece a pintura",
    subtitle: "Proteção correta reduz oxidação e perda de brilho.",
    footer: "Salve esta curiosidade",
    background: "story-assets/ceramic-water-beading.png",
    output: "story-curiosidade.jpg",
  });
  await generate({
    slot: "tarde",
    layout: "bottom",
    eyebrow: "Dica de cuidado",
    title: "Cada fresta pede a ferramenta certa",
    subtitle: "Pincéis delicados limpam sem riscar acabamentos.",
    footer: "Precisão em cada detalhe",
    background: "story-assets/dashboard-detailing.png",
    output: "story-dica.jpg",
  });
  await generate({
    slot: "noite",
    layout: "center",
    eyebrow: "Nos bastidores",
    title: "A pré-lavagem faz a diferença",
    subtitle: "Menos atrito com a pintura, mais segurança no processo.",
    footer: "Método Garagem do Ka",
    background: "story-assets/snow-foam-wash.png",
    output: "story-bastidor.jpg",
  });
  await generate({
    slot: "tarde",
    layout: "upper",
    eyebrow: "Conta pra gente",
    title: "O que mais incomoda no seu carro?",
    subtitle: "Manchas internas ou pintura sem brilho?",
    footer: "Responda no direct",
    background: "story-assets/interior.jpg",
    output: "story-enquete.jpg",
  });
  await generate({
    slot: "noite",
    layout: "bottom",
    eyebrow: "Cuidado premium",
    title: "Polimento técnico",
    subtitle: "Correção de pintura e brilho profundo.",
    footer: "Agende pelo WhatsApp",
    price: "A partir de R$ 289",
    background: "story-assets/polimento.jpg",
    output: "story-oferta.jpg",
  });
  console.log(`5 exemplos gerados em ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
