/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ghost: {
          canvas: 'rgb(var(--ghost-canvas) / <alpha-value>)',
          surface: 'rgb(var(--ghost-surface) / <alpha-value>)',
          elevated: 'rgb(var(--ghost-elevated) / <alpha-value>)',
          recessed: 'rgb(var(--ghost-recessed) / <alpha-value>)',
          border: 'rgb(var(--ghost-border) / <alpha-value>)',
          borderStrong: 'rgb(var(--ghost-border-strong) / <alpha-value>)',
          ink: 'rgb(var(--ghost-ink) / <alpha-value>)',
          secondary: 'rgb(var(--ghost-secondary) / <alpha-value>)',
          muted: 'rgb(var(--ghost-muted) / <alpha-value>)',
          accent: 'rgb(var(--ghost-accent) / <alpha-value>)',
          accentHover: 'rgb(var(--ghost-accent-hover) / <alpha-value>)',
          accentInk: 'rgb(var(--ghost-accent-ink) / <alpha-value>)',
          accentSoft: 'rgb(var(--ghost-accent-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      boxShadow: {
        neon: 'var(--ghost-shadow-neon)',
        neonSm: 'var(--ghost-shadow-neon-sm)',
        dock: 'var(--ghost-shadow-dock)',
      },
    },
  },
  plugins: [],
};
