/**
 * Tokens literais do Story 1080×1920 (spec v2).
 * Ajuste só a cor de marca aqui.
 */
export const STORY_TOKENS = {
  canvas: {
    width: 1080,
    height: 1920,
  },

  /** Margem lateral fixa — alinhamento à esquerda */
  marginX: 64,

  /**
   * Safe zones (UI do app cobre essas faixas):
   * topo 0–220 · base 1700–1920
   * Texto vive entre y=1100 e y=1650 (layout bottom)
   */
  safe: {
    topEnd: 250,
    contentStart: 1100,
    contentEnd: 1650,
    bottomStart: 1700,
  },

  space: {
    badgeToTitle: 24,
    titleToPrice: 20,
    priceToSupport: 16,
  },

  radius: {
    badge: 6,
    price: 6,
  },

  color: {
    /** Única cor de destaque da marca */
    brand: "#FFC107",
    onBrand: "#111111",
    text: "#FFFFFF",
    textSupport: "rgba(255,255,255,0.85)",
    badgeBg: "rgba(255,255,255,0.9)",
    badgeText: "#111111",
  },

  typography: {
    displayFamily: "MontserratDisplay, Arial Black, sans-serif",
    bodyFamily: "NotoStory, Arial, Helvetica, sans-serif",
    badge: { size: 22, tracking: 2 },
    title: { size: 64, lineHeight: 70, maxLines: 3 },
    price: { size: 32 },
    support: { size: 28, lineHeight: 34, maxLines: 2 },
  },

  /**
   * Único overlay sobre a foto:
   * transparente em y=1000 → preto 0.75 em y=1920
   */
  gradient: {
    startY: 1000,
    endY: 1920,
    startOpacity: 0,
    endOpacity: 0.75,
  },

  /** text-shadow leve — sem stroke */
  textShadow: "0 2px 8px rgba(0,0,0,0.4)",

  export: {
    jpegQuality: 92,
  },
} as const;

/** Três composições alternadas para o perfil não parecer um template repetido. */
export const STORY_LAYOUTS = ["bottom", "center", "upper"] as const;
export type StoryLayoutId = (typeof STORY_LAYOUTS)[number];
