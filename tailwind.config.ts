import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

/**
 * Colour values live in `src/styles/theme.css` as HSL channels; this file only
 * maps them onto Tailwind utility names. Adding a colour here without adding
 * the variable there (or vice versa) is the only way the two can drift.
 */
const withAlpha = (variable: string) => `hsl(var(${variable}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: withAlpha('--border'),
        input: withAlpha('--input'),
        ring: withAlpha('--ring'),
        background: withAlpha('--background'),
        foreground: withAlpha('--foreground'),
        primary: {
          DEFAULT: withAlpha('--primary'),
          foreground: withAlpha('--primary-foreground'),
          hover: withAlpha('--primary-hover'),
          active: withAlpha('--primary-active'),
          subtle: withAlpha('--primary-subtle'),
        },
        secondary: {
          DEFAULT: withAlpha('--secondary'),
          foreground: withAlpha('--secondary-foreground'),
        },
        muted: {
          DEFAULT: withAlpha('--muted'),
          foreground: withAlpha('--muted-foreground'),
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          foreground: withAlpha('--accent-foreground'),
        },
        card: {
          DEFAULT: withAlpha('--card'),
          foreground: withAlpha('--card-foreground'),
        },
        popover: {
          DEFAULT: withAlpha('--popover'),
          foreground: withAlpha('--popover-foreground'),
        },
        success: {
          DEFAULT: withAlpha('--success'),
          foreground: withAlpha('--success-foreground'),
          subtle: withAlpha('--success-subtle'),
        },
        warning: {
          DEFAULT: withAlpha('--warning'),
          foreground: withAlpha('--warning-foreground'),
          subtle: withAlpha('--warning-subtle'),
        },
        danger: {
          DEFAULT: withAlpha('--danger'),
          foreground: withAlpha('--danger-foreground'),
          subtle: withAlpha('--danger-subtle'),
        },
        info: {
          DEFAULT: withAlpha('--info'),
          foreground: withAlpha('--info-foreground'),
          subtle: withAlpha('--info-subtle'),
        },
        destructive: {
          DEFAULT: withAlpha('--danger'),
          foreground: withAlpha('--danger-foreground'),
        },
        sidebar: {
          DEFAULT: withAlpha('--sidebar'),
          foreground: withAlpha('--sidebar-foreground'),
          'muted-foreground': withAlpha('--sidebar-muted-foreground'),
          active: withAlpha('--sidebar-active'),
          border: withAlpha('--sidebar-border'),
        },
        chart: {
          1: withAlpha('--chart-1'),
          2: withAlpha('--chart-2'),
          3: withAlpha('--chart-3'),
          4: withAlpha('--chart-4'),
          5: withAlpha('--chart-5'),
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        // Noto Sans Lao first: it carries Lao, and falls through to Inter for
        // Latin so mixed lo/en strings keep one visual weight.
        sans: [
          '"Noto Sans Lao"',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // Indeterminate bar shown while a table refetches in the background.
        loading: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        loading: 'loading 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
