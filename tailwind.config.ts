import type { Config } from "tailwindcss";

// Palette taken from the company logo: olive charcoal, gold, black.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#4f5444", dark: "#3b3f32", deeper: "#2a2d24", light: "#ebede5", mid: "#6b7157" },
        gold: { DEFAULT: "#e3b02e", light: "#fbf3d6", bright: "#f2c744", dark: "#b8861a" },
        ink: "#1f2120",
        canvas: "#f6f6f2",
        line: "#e4e4dc",
      },
      boxShadow: { card: "0 1px 2px rgba(31,33,32,.05), 0 4px 14px rgba(31,33,32,.05)" },
      borderRadius: { xl2: "14px" },
    },
  },
  plugins: [],
} satisfies Config;
