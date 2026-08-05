// EST ELITE — PT → EN translations for image prompt generation.

export const BODY_TYPE_EN: Record<string, string> = {
  "Ampulheta": "hourglass",
  "Triângulo Invertido": "inverted triangle",
  "Triângulo": "triangle",
  "Retângulo": "rectangle",
  "Oval": "oval",
};

export const FIT_EN: Record<string, string> = {
  "Bem ajustado": "fitted",
  "Levemente ajustado": "slightly fitted",
  "Reto": "straight",
  "Folgado": "relaxed",
  "Oversized": "oversized",
};

export const FORMALITY_EN: Record<string, string> = {
  "Casual": "casual",
  "Smart Casual": "smart casual",
  "Business Casual": "business casual",
  "Formal": "formal",
  "Black Tie": "black tie",
};

export const CLIMATE_FABRIC_EN: Record<string, string> = {
  "Tropical (quente o ano todo)": "linen, light viscose, cotton voile, breathable fabrics",
  "Subtropical (verões quentes, invernos amenos)": "cotton, light wool, ponte, modal",
  "Temperado (4 estações)": "wool blend, silk, denim, structured cotton",
  "Frio (invernos rigorosos)": "cashmere, heavy wool, tweed, velvet, bouclé",
};

export const SKIN_TONE_EN: Record<string, string> = {
  "Muito Claro": "very fair",
  "Claro": "fair",
  "Médio": "medium",
  "Escuro": "dark",
  "Muito Escuro": "very dark",
};

export const STYLE_EN: Record<string, string> = {
  "Clássico e atemporal": "classic timeless",
  "Romântico e delicado": "romantic delicate",
  "Moderno e minimalista": "modern minimalist",
  "Ousado e marcante": "bold statement",
  "Boho e despojado": "bohemian relaxed",
  "Elegante e sofisticado": "elegant sophisticated",
};

export const OCCASION_EN: Record<string, string> = {
  "Trabalho/Escritório": "office work",
  "Casual/Dia a dia": "casual everyday",
  "Eventos sociais": "social events",
  "Ocasiões formais": "formal occasions",
  "Esportes/Academia": "sports gym",
  "Viagens": "travel",
};

export const STYLE_PALETTE: Record<string, string> = {
  "Clássico e atemporal": "ivory, camel, navy, cognac, charcoal grey",
  "Romântico e delicado": "blush rose, dusty mauve, champagne, powder blue, ivory",
  "Moderno e minimalista": "off-white, stone grey, black, ecru, warm white",
  "Ousado e marcante": "cobalt, burnt orange, deep red, emerald, mustard",
  "Boho e despojado": "terracotta, rust, olive green, warm sand, indigo",
  "Elegante e sofisticado": "burgundy, champagne, deep navy, taupe, gold",
};

export const STYLE_PROPS: Record<string, string> = {
  "Clássico e atemporal": "structured leather handbag, silk scarf, gold watch, loafers",
  "Romântico e delicado": "pearl jewelry, floral fabric, lace details, ballet flats, ribbon",
  "Moderno e minimalista": "architectural bag, clean lines, geometric jewelry, white sneakers",
  "Ousado e marcante": "statement earrings, bold belt, animal print, platform heels",
  "Boho e despojado": "woven basket bag, layered necklaces, suede ankle boots, ethnic prints",
  "Elegante e sofisticado": "structured clutch, fine jewelry, pointed heels, cashmere",
};

export const BODY_MODELAGEM: Record<string, string> = {
  "Ampulheta": "wrap dress, fitted blazer, belted trench coat, high-waist wide-leg trousers",
  "Triângulo Invertido": "A-line skirt, wide-leg pants, straight-leg jeans, flared trousers",
  "Triângulo": "structured blazer with shoulder detail, boat neck top, peplum, wide shoulder coats",
  "Retângulo": "peplum top, wrap blouse, belted dress, ruched fabric, layered pieces",
  "Oval": "V-neck dress, empire waist, straight-leg pants, long cardigan, column silhouette",
};

export const OCCASION_OUTFIT: Record<string, string> = {
  "Trabalho/Escritório": "tailored blazer, trousers, pointed toe heels, structured bag, office setting",
  "Casual/Dia a dia": "relaxed jeans, quality t-shirt, sneakers, crossbody bag, urban street",
  "Eventos sociais": "midi dress or jumpsuit, strappy heels, evening bag, cocktail setting",
  "Ocasiões formais": "floor-length gown or sharp suit, fine jewelry, formal venue",
  "Esportes/Academia": "performance leggings, sports bra, athletic sneakers, gym bag, studio",
  "Viagens": "comfortable chic separates, sneakers, carry-on, airport terminal",
};

export const SEASON_PALETTE: Record<string, Record<string, string>> = {
  "Muito Claro": {
    "Clássico e atemporal":    "soft white, pale blush, light grey, silver",
    "Romântico e delicado":    "powder pink, lavender, pale peach, ivory",
    "Moderno e minimalista":   "pure white, light stone, silver, pale grey",
    "Ousado e marcante":       "coral, sky blue, warm red, bright gold",
    "Boho e despojado":        "warm ivory, light terracotta, dusty rose, sand",
    "Elegante e sofisticado":  "champagne, pearl, platinum, rose gold",
  },
  "Claro": {
    "Clássico e atemporal":    "ivory, camel, warm grey, blush",
    "Romântico e delicado":    "dusty rose, powder blue, warm peach, mauve",
    "Moderno e minimalista":   "ecru, warm white, light taupe, blush",
    "Ousado e marcante":       "cobalt blue, tomato red, bright coral, turquoise",
    "Boho e despojado":        "burnt sienna, warm olive, dusty rose, wheat",
    "Elegante e sofisticado":  "rose gold, soft champagne, warm blush, light bronze",
  },
  "Médio": {
    "Clássico e atemporal":    "camel, burgundy, navy, warm tan",
    "Romântico e delicado":    "dusty mauve, warm coral, terracotta rose, orchid",
    "Moderno e minimalista":   "warm stone, terracotta, dusty olive, cafe au lait",
    "Ousado e marcante":       "cobalt, mustard, burnt orange, rich teal",
    "Boho e despojado":        "rust, warm terracotta, olive, rich cream",
    "Elegante e sofisticado":  "burgundy, champagne, deep olive, warm bronze",
  },
  "Escuro": {
    "Clássico e atemporal":    "deep navy, chocolate brown, warm black, rich camel",
    "Romântico e delicado":    "deep plum, rich rose, warm burgundy, copper",
    "Moderno e minimalista":   "charcoal, warm black, deep taupe, rich brown",
    "Ousado e marcante":       "bold orange, emerald, gold, hot pink",
    "Boho e despojado":        "deep rust, rich olive, ochre, warm brown",
    "Elegante e sofisticado":  "deep burgundy, gold, rich emerald, warm black",
  },
  "Muito Escuro": {
    "Clássico e atemporal":    "pure white, cream, warm ivory, rich camel",
    "Romântico e delicado":    "bright coral, fuchsia, warm white, gold",
    "Moderno e minimalista":   "pure white, bright ecru, crisp black, bold red",
    "Ousado e marcante":       "neon orange, bright gold, vivid pink, electric blue",
    "Boho e despojado":        "bright terracotta, warm white, bold orange, gold",
    "Elegante e sofisticado":  "pure white, bright gold, rich jewel tones, champagne",
  },
};
