/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm, refined palette — not generic fintech blue
        sand: {
          50:  '#FDFCFA',
          100: '#FAF7F2',
          200: '#F0EBE1',
          300: '#E2D9CA',
          400: '#C9BDA8',
          500: '#A89882',
          600: '#8A7A64',
          700: '#6B5D4A',
          800: '#4D4235',
          900: '#2F2921',
        },
        ink: {
          50:  '#F4F3F1',
          100: '#E0DEDA',
          200: '#B8B3AB',
          300: '#8F897E',
          400: '#6B645A',
          500: '#4A443C',
          600: '#3A3530',
          700: '#2B2724',
          800: '#1D1A18',
          900: '#0F0E0D',
        },
        accent: {
          green:  '#3D7A5F',
          red:    '#B85450',
          blue:   '#4A6FA5',
          gold:   '#C4983B',
        },
      },
      fontFamily: {
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
