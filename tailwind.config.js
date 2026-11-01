/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ghost: {
          canvas: '#EBEEF2',
          surface: '#F6F7F9',
          elevated: '#FFFFFF',
          recessed: '#DFE3EA',
          border: '#D1D6E0',
          borderStrong: '#B6BECB',
          ink: '#111318',
          secondary: '#4E5564',
          muted: '#7E8696',
          red: '#FF1E38',
          redHover: '#FF334B',
          redSoft: '#FFE4E8',
          redMuted: '#FFD0D7',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        neon: '0 6px 22px -4px rgba(255, 30, 56, 0.44)',
        neonSm: '0 2px 10px -2px rgba(255, 30, 56, 0.36)',
        card: '0 2px 8px -2px rgba(17, 19, 24, 0.05), 0 1px 2px rgba(17, 19, 24, 0.04)',
      },
    },
  },
  plugins: [],
};
