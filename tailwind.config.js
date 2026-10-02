/** @type {import('tailwindcss').Config} */

// Palette colors are CSS variables holding "r g b" triplets (see globals.css) so
// the whole app can flip between light and dark by toggling `.dark` on <html>,
// while opacity modifiers (bg-ink-800/10, bg-sand-50/60, …) keep working.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, steps) =>
  Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm, refined palette — not generic fintech blue.
        // sand = surfaces & hairlines, ink = text.
        sand: scale('sand', STEPS),
        ink: scale('ink', STEPS),
        accent: {
          green:  v('accent-green'),
          money:  v('accent-money'),
          red:    v('accent-red'),
          blue:   v('accent-blue'),
          gold:   v('accent-gold'),
          purple: v('accent-purple'),
        },
      },
      // Tighter corners than Tailwind's defaults (xl 12 / 2xl 16 / 3xl 24px). Cards use 3xl.
      // `rounded-full` (dots, avatars, pill chips) is untouched.
      borderRadius: {
        sm: '2px',
        DEFAULT: '3px',
        md: '4px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
      },
      fontFamily: {
        // Display numerals/headings use the same geometric sans as the body —
        // cleaner next to the glass/gradient surfaces than the old serif.
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
