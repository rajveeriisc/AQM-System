/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] },
      colors: {
        aqi: {
          good: '#22C55E',
          moderate: '#EAB308',
          sensitive: '#F97316',
          unhealthy: '#EF4444',
          veryUnhealthy: '#A855F7',
          hazardous: '#7F1D1D',
        },
      },
    },
  },
  plugins: [],
};
