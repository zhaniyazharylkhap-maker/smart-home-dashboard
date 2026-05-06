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
        bg: "#f8faf8",
        surface: "#ffffff",
        "surface-2": "#f0f5f0",
        border: "#d4e6d4",
        accent: "#16a34a",
        "accent-hover": "#15803d",
        "accent-light": "#dcfce7",
        "accent-mid": "#86efac",
        amber: "#d97706",
        "amber-light": "#fef3c7",
        danger: "#dc2626",
        "danger-light": "#fee2e2",
        "text-primary": "#111827",
        "text-secondary": "#4b5563",
        "text-dim": "#9ca3af",
      },
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        btn: "10px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px #d4e6d4",
      },
    },
  },
  plugins: [],
};

export default config;
