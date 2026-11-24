/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './web/**/*.{js,jsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', 'Inter', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        rounded: ['ui-rounded', '"SF Pro Rounded"', '-apple-system', 'BlinkMacSystemFont', 'Inter', 'sans-serif'],
      },
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        card2: 'rgb(var(--card2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        ink2: 'rgb(var(--ink2) / <alpha-value>)',
        ink3: 'rgb(var(--ink3) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        mint: { DEFAULT: 'rgb(var(--mint) / <alpha-value>)', soft: 'rgb(var(--mint-soft) / <alpha-value>)' },
        coral: { DEFAULT: 'rgb(var(--coral) / <alpha-value>)', soft: 'rgb(var(--coral-soft) / <alpha-value>)' },
        lav: { DEFAULT: 'rgb(var(--lav) / <alpha-value>)', soft: 'rgb(var(--lav-soft) / <alpha-value>)' },
        sky: { DEFAULT: 'rgb(var(--sky) / <alpha-value>)', soft: 'rgb(var(--sky-soft) / <alpha-value>)' },
        peach: { DEFAULT: 'rgb(var(--peach) / <alpha-value>)', soft: 'rgb(var(--peach-soft) / <alpha-value>)' },
        butter: { DEFAULT: 'rgb(var(--butter) / <alpha-value>)', soft: 'rgb(var(--butter-soft) / <alpha-value>)' },
        rose: { DEFAULT: 'rgb(var(--rose) / <alpha-value>)', soft: 'rgb(var(--rose-soft) / <alpha-value>)' },
      },
      boxShadow: {
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -8px rgb(0 0 0 / 0.08)',
        lift: '0 2px 6px rgb(0 0 0 / 0.06), 0 18px 40px -12px rgb(0 0 0 / 0.18)',
      },
      borderRadius: { '4xl': '2rem' },
    },
  },
  plugins: [],
};
