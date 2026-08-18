import fs from "node:fs";
import path from "node:path";

export const SVG_FONT_FAMILY = "GaragemSans";

let embeddedFontCss: string | null = null;

/** Incorpora a fonte no próprio SVG para funcionar também no Linux da Vercel. */
export function getEmbeddedSvgFontCss() {
  if (embeddedFontCss) return embeddedFontCss;
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSans-Regular.ttf");
  const base64 = fs.readFileSync(fontPath).toString("base64");
  embeddedFontCss = `<style>
    @font-face {
      font-family: '${SVG_FONT_FAMILY}';
      src: url(data:font/truetype;base64,${base64}) format('truetype');
      font-style: normal;
      font-weight: 100 900;
    }
    text { font-family: '${SVG_FONT_FAMILY}', sans-serif; }
  </style>`;
  return embeddedFontCss;
}
