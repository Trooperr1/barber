/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f4f5',
          100: '#e4e4e7',
          500: '#3f3f46',
          600: '#27272a',
          700: '#18181b',
        },
      },
    },
  },
  plugins: [],
};
