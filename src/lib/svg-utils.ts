let logoBase64Cache: string | null = null;

/**
 * Carrega a logo em base64 (com cache para performance)
 */
export async function getLogoBase64(): Promise<string> {
  if (logoBase64Cache) return logoBase64Cache;
  
  try {
    const fs = await import("fs");
    const path = await import("path");
    const logoPath = path.resolve(process.cwd(), "public", "logo-garagem-do-ka.png");
    const logoBuffer = fs.readFileSync(logoPath);
    logoBase64Cache = logoBuffer.toString("base64");
    return logoBase64Cache;
  } catch {
    // Fallback: return empty string if logo not found
    return "";
  }
}

/**
 * Renderiza a logo no SVG mantendo proporção original
 * @param x - Posição X
 * @param y - Posição Y  
 * @param maxWidth - Largura máxima
 * @param maxHeight - Altura máxima
 */
export async function renderLogo(x: number, y: number, maxWidth: number, maxHeight: number): Promise<string> {
  const logoBase64 = await getLogoBase64();
  
  if (!logoBase64) {
    // Fallback placeholder se logo não encontrada
    const fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";
    return `
      <rect x="${x}" y="${y}" width="${maxWidth}" height="${maxHeight}" fill="#c9a24b" rx="8"/>
      <text x="${x + maxWidth/2}" y="${y + maxHeight/2 + 6}" text-anchor="middle" fill="#0d0d0d" font-family="${fontFamily}" font-weight="bold" font-size="14">LOGO</text>
    `;
  }
  
  // Calcular proporção para manter aspect ratio
  // Assumindo proporção típica de logo (pode ser ajustado conforme necessário)
  const aspectRatio = 1.5; // largura/altura típico
  let finalWidth = maxWidth;
  let finalHeight = maxWidth / aspectRatio;
  
  if (finalHeight > maxHeight) {
    finalHeight = maxHeight;
    finalWidth = maxHeight * aspectRatio;
  }
  
  // Centralizar
  const finalX = x + (maxWidth - finalWidth) / 2;
  const finalY = y + (maxHeight - finalHeight) / 2;
  
  return `
    <image 
      x="${finalX}" 
      y="${finalY}" 
      width="${finalWidth}" 
      height="${finalHeight}" 
      href="data:image/png;base64,${logoBase64}" 
      preserveAspectRatio="xMidYMid meet"
    />
  `;
}