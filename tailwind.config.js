/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        serif: ['Fraunces', 'Georgia', 'serif'],
      },
      colors: {
        ink: { 950: '#05060a', 900: '#0a0b10', 850: '#0e1017', 800: '#12141d', 700: '#1a1d29', 600: '#262a3a' },
        violet: { 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed' },
        cyan: { 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4' },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,.25), 0 10px 40px -10px rgba(139,92,246,.45)',
        'glow-cyan': '0 0 0 1px rgba(34,211,238,.25), 0 10px 40px -10px rgba(34,211,238,.4)',
        card: '0 1px 0 0 rgba(255,255,255,.04) inset, 0 20px 50px -20px rgba(0,0,0,.7)',
      },
      keyframes: {
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseRing: { '0%': { transform: 'scale(.9)', opacity: '.7' }, '100%': { transform: 'scale(1.6)', opacity: '0' } },
      },
      animation: { float: 'float 6s ease-in-out infinite', shimmer: 'shimmer 1.6s infinite', pulseRing: 'pulseRing 1.8s ease-out infinite' },
    },
  },
  plugins: [],
};
