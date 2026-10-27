import type { Config } from "tailwindcss";
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { brand: { DEFAULT: "#0f5132", light: "#d1e7dd", dark: "#0a3622" } } } },
  plugins: [],
} satisfies Config;
