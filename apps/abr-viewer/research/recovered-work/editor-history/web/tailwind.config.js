/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Photoshop-like dark theme colors
        ps: {
          bg: {
            dark: "#1e1e1e",
            DEFAULT: "#2b2b2b",
            light: "#3c3c3c",
            lighter: "#4a4a4a",
          },
          border: {
            dark: "#1a1a1a",
            DEFAULT: "#3d3d3d",
            light: "#5a5a5a",
          },
          text: {
            muted: "#8c8c8c",
            DEFAULT: "#cccccc",
            bright: "#ffffff",
          },
          accent: {
            DEFAULT: "#2d9cdb",
            hover: "#3daee9",
            active: "#1d8cc9",
          },
          success: "#27ae60",
          warning: "#f39c12",
          error: "#e74c3c",
        },
      },
      fontFamily: {
        sans: [
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "Consolas",
          "Monaco",
          "Andale Mono",
          "Ubuntu Mono",
          "monospace",
        ],
      },
      boxShadow: {
        ps: "0 2px 8px rgba(0, 0, 0, 0.5)",
        "ps-lg": "0 4px 16px rgba(0, 0, 0, 0.6)",
      },
    },
  },
  plugins: [],
};
