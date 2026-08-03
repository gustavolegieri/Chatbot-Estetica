import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/admin/mobile",
    name: "Garagem do Ka — Atendimento",
    short_name: "Garagem do Ka",
    description: "Central mobile de conversas, clientes e agendamentos da Garagem do Ka.",
    start_url: "/admin/mobile",
    scope: "/",
    display: "standalone",
    background_color: "#07110d",
    theme_color: "#0b1f17",
    orientation: "portrait-primary",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
