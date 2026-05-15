import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "hsl(var(--ink))",
        panel: "hsl(var(--panel))",
        accent: "hsl(var(--accent))"
      },
      boxShadow: {
        focus: "0 0 0 1px rgba(255,255,255,0.18), 0 0 0 6px rgba(40,194,160,0.12)"
      }
    }
  },
  plugins: []
} satisfies Config;
