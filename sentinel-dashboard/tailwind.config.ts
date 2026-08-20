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
        void: "#080C18",
        deep: "#0D1225",
        panel: "#151C33",
        panel2: "#1C2440",
        line: "#252E4D",
        ice: "#C6D6F5",
        muted: "#71809F",
        white: "#F2F5FC",
        signal: "#E8542F",
        up: "#2BA36B",
        down: "#E8542F",
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        phone: "42px",
      },
      animation: {
        pop: "pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.3)",
        fade: "fade 0.22s ease",
        spin: "spin 0.7s linear",
      },
      keyframes: {
        pop: {
          from: { opacity: "0", transform: "translateY(-14px) scale(0.96)" },
          to: { opacity: "1", transform: "none" },
        },
        fade: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        spin: {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
