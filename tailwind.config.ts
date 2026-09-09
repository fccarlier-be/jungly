import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        forest: "#2f4a34",
        sage: "#7c9473",
        clay: "#b3684a",
        sand: "#f4efe6",
        ink: "#2c2a26",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-body)"],
      },
      borderRadius: {
        lg: "1rem",
        xl: "1.25rem",
        "2xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(44, 42, 38, 0.04), 0 6px 16px -8px rgba(44, 42, 38, 0.12)",
        lift: "0 4px 8px rgba(44, 42, 38, 0.06), 0 16px 32px -12px rgba(44, 42, 38, 0.18)",
      },
      keyframes: {
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop": {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.06)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.35s ease-out both",
        pop: "pop 0.3s ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
