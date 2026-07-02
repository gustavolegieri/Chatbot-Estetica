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
};


export default nextConfig;
