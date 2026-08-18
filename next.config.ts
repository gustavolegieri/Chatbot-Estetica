import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Temporariamente desabilitado para estabilizar o build no ambiente local.
  // Depois que o build finalizar, podemos reativar se necessário para deploy.
  // output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // Canvas e a pilha de voz/WebSocket devem executar diretamente no Node.
  // Empacotar `ws` no servidor altera o fallback opcional de buffer e pode
  // travar respostas de áudio com `bufferUtil.mask is not a function`.
  serverExternalPackages: ["@napi-rs/canvas", "msedge-tts", "isomorphic-ws", "ws"],
};


export default nextConfig;
