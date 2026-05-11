import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm monograph palette (OKLCH approximations in hex for opacity modifier support)
        accent: {
          DEFAULT: '#7b3820',
          50:  '#fdf5f0',
          100: '#fae8de',
          200: '#f5ccb5',
          300: '#eda882',
          400: '#e27c4e',
          500: '#d55a2a',
          600: '#b84220',
          700: '#96341c',
          800: '#7b3820',
          900: '#5a2c1a',
        },
        surface:     '#f0ece2',
        muted:       '#887b72',
        'near-black': '#2a2520',
        'near-white': '#f7f4ed',
        border:      '#dbd6cd',
        paper:       '#faf8f4',
        'ink-soft':  '#5d5448',
        'ink-faint': '#b5ada4',
        'line-soft': '#eae6de',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Garamond', 'Times New Roman', 'serif'],
        mono:  ['JetBrains Mono', 'ui-monospace', 'monospace'],
        // no sans — body is serif, UI is mono
      },
      fontSize: {
        '2xs': ['0.62rem', { lineHeight: '1rem', letterSpacing: '0.06em' }],
      },
      animation: {
        'fade-in':   'fadeIn 0.25s ease-out',
        'slide-up':  'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in':  'slideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
        shimmer:     'shimmer 1.8s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-600px 0' },
          '100%': { backgroundPosition: '600px 0' },
        },
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};

export default config;
