import type { Metadata } from "next";
import { GateLiveViewer } from "@/components/gate-live/GateLiveViewer";

export const metadata: Metadata = {
  title: "Acompanhe seu veículo | Garagem do Ka",
  description: "Acompanhamento privado do atendimento do seu veículo.",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function GateLivePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GateLiveViewer token={token} />;
}
