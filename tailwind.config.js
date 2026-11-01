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
          red: 'rgb(var(--ghost-red) / <alpha-value>)',
          redHover: 'rgb(var(--ghost-red-hover) / <alpha-value>)',
          redSoft: 'rgb(var(--ghost-red-soft) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        neon: '0 4px 18px -2px rgba(255, 30, 56, 0.42)',
        neonSm: '0 2px 10px -2px rgba(255, 30, 56, 0.34)',
      },
    },
  },
  plugins: [],
};
