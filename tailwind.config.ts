import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#14181f',
        paper: '#f7f8fa',
        brand: {
          50: '#eefcf3',
          100: '#d6f7e2',
          400: '#22b76a',
          500: '#159a56',
          600: '#0f7a44',
          700: '#0c5f36',
        },
        warn: '#c2410c',
        danger: '#b91c1c',
      },
      fontFamily: {
        display: ['ui-sans-serif', 'system-ui'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
export default config;
