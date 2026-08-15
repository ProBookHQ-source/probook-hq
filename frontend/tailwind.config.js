/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Extended from the original 3-stop palette to cover the full periwinkle→indigo
        // gradient used in the Tractify pitch deck (see LandingPage.jsx) — 50/100/500/600/700
        // are unchanged so nothing elsewhere in the app shifts color.
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          300: '#a9a7fb',
          400: '#8583f7',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#37339e',
          900: '#282566',
        },
      },
    },
  },
  plugins: [],
};
