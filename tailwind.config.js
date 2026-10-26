/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/client/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f3efe6",
        card: "#fffdf8",
        ink: "#241c15",
        rule: "#d9cfc0",
        forest: "#1e5c45",
        forestdeep: "#143d2e",
        stamp: "#8a5a12",
      },
      fontFamily: {
        serif: ["Fraunces", "Iowan Old Style", "Palatino", "Georgia", "serif"],
        sans: ["Outfit", "Avenir Next", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
