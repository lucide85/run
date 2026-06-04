/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Sporty-Plania teal (matcher design.css --primary-*)
        brand: {
          50: "#F3FBFC",
          100: "#D8F3F6",
          300: "#62C9D9",
          500: "#008094",
          600: "#004B57",
          700: "#003A44",
        },
      },
      fontFamily: {
        sans: ["InterPl", "Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
