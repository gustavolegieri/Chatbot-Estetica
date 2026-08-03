import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Estética Automotiva em Jundiaí | Garagem do Ka",
  description: "Solicite uma avaliação personalizada para lavagem, polimento, proteção de pintura ou higienização do seu veículo em Jundiaí.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Garagem do Ka — Estética Automotiva em Jundiaí",
    description: "Descubra o cuidado ideal para o seu veículo e organize seu atendimento pelo WhatsApp.",
    type: "website",
    locale: "pt_BR",
  },
};

export default function JundiaiLayout({ children }: { children: React.ReactNode }) {
  return children;
}
