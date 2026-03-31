/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        card: "#111111",
        border: "#1f1f1f",
        muted: "#71717a",
        "muted-foreground": "#a1a1aa",
        accent: "#18181b",
        foreground: "#fafafa",
        primary: "#3b82f6",
        "primary-foreground": "#fff",
        destructive: "#ef4444",
        amber: { 400: "#fbbf24" },
        emerald: { 400: "#34d399", 500: "#10b981" },
        blue: { 400: "#60a5fa" },
        violet: { 400: "#a78bfa" },
        red: { 400: "#f87171" },
        zinc: { 400: "#a1a1aa", 500: "#71717a", 800: "#27272a", 900: "#18181b" },
      },
      fontFamily: {
        mono: ["Courier New", "monospace"],
      },
    },
  },
  plugins: [],
}
