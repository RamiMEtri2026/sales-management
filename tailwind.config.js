/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "\"Segoe UI\"",
          "Tahoma",
          "\"Noto Sans Arabic\"",
          "\"Helvetica Neue\"",
          "Arial",
          "sans-serif",
        ],
        serif: [
          "\"Traditional Arabic\"",
          "\"Noto Naskh Arabic\"",
          "Amiri",
          "Georgia",
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
