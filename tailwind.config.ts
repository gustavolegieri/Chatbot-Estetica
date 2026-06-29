import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf6eb",
          100: "#f5ecd3",
          200: "#e8d5a3",
          300: "#d4af37",
          400: "#c5a028",
          500: "#b8941f",
          600: "#9a7b1a",
          700: "#7c6315",
          800: "#5e4b10",
          900: "#40330b",
          950: "#2a2207",
        },
        surface: {
          950: "#000000",
          900: "#0a0a0a",
          850: "#121212",
          800: "#1a1a1a",
          750: "#1e1e1e",
          700: "#252525",
          600: "#2d2d2d",
          500: "#3a3a3a",
        },
      },
      fontFamily: {
        serif: ["var(--font-playfair)", "Georgia", "serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "gold-gradient": "linear-gradient(135deg, #d4af37 0%, #9a7b1a 50%, #c5a028 100%)",
        "gold-shine": "linear-gradient(90deg, #7c6315, #d4af37, #f5ecd3, #d4af37, #7c6315)",
        "dark-radial": "radial-gradient(ellipse at top, #1a1a1a 0%, #0a0a0a 50%, #000000 100%)",
      },
      boxShadow: {
        gold: "0 0 20px rgba(212, 175, 55, 0.15)",
        "gold-lg": "0 4px 24px rgba(212, 175, 55, 0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
