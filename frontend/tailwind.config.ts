import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b1018",
        surface: "#111826",
        "surface-2": "#161f2e",
        "surface-3": "#1b2536",
        border: "#1f2a3a",
        "border-strong": "#2a3954",
        accent: "#14C3A6",
        "accent-hover": "#10a88f",
        "accent-light": "rgba(20,195,166,0.12)",
        "accent-mid": "#0f9f86",
        safe: "#10b981",
        "safe-light": "rgba(16,185,129,0.12)",
        amber: "#f59e0b",
        "amber-light": "rgba(245,158,11,0.12)",
        danger: "#ef4444",
        "danger-light": "rgba(239,68,68,0.12)",
        "danger-glow": "rgba(239,68,68,0.18)",
        "text-primary": "#e6edf7",
        "text-secondary": "#9aa7bb",
        "text-dim": "#5c6a82",
        "text-on-accent": "#04131a",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "monospace",
        ],
      },
      fontSize: {
        kpi: ["2.625rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "kpi-sm": ["2rem", { lineHeight: "1.05", letterSpacing: "-0.01em" }],
      },
      borderRadius: {
        card: "14px",
        btn: "10px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.4)",
        panel:
          "0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 16px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(239,68,68,0.45), 0 0 24px rgba(239,68,68,0.18)",
      },
      keyframes: {
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" },
        },
        "glow-pulse": {
          "0%, 100%": {
            boxShadow:
              "0 0 0 1px rgba(239,68,68,0.35), 0 0 16px rgba(239,68,68,0.12)",
          },
          "50%": {
            boxShadow:
              "0 0 0 1px rgba(239,68,68,0.55), 0 0 28px rgba(239,68,68,0.28)",
          },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
      animation: {
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "glow-pulse": "glow-pulse 2.4s ease-in-out infinite",
        "fade-in": "fade-in 0.2s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
